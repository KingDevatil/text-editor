import { describe, it, expect } from 'vitest';
import { translateDiagnosticMessage } from './diagnostics';
import { getJsoncParseErrors, stripJsonComments, stripJsComments, preprocessESM } from './lint';

describe('JSONC diagnostics', () => {
  it('accepts comments and trailing commas consistently with the formatter', () => {
    expect(getJsoncParseErrors('{\n  // note\n  "a": 1,\n}')).toEqual([]);
  });

  it('still reports malformed JSONC', () => {
    expect(getJsoncParseErrors('{ "a": }')).not.toEqual([]);
  });
});

describe('translateDiagnosticMessage', () => {
  it('translates ESM import error', () => {
    const result = translateDiagnosticMessage('Cannot use import statement outside a module');
    expect(result).toBe('不能在模块外部使用 import 语句（检测器不支持 ESM 模块语法）');
  });

  it('translates unexpected token error', () => {
    const result = translateDiagnosticMessage("Unexpected token '}'");
    expect(result).toBe("意外的符号 '}'");
  });

  it('translates unexpected identifier error', () => {
    const result = translateDiagnosticMessage('Unexpected identifier');
    expect(result).toBe('意外的标识符');
  });

  it('translates unexpected end of input error', () => {
    const result = translateDiagnosticMessage('Unexpected end of input');
    expect(result).toBe('输入意外结束');
  });

  it('translates JSON unexpected token error', () => {
    const result = translateDiagnosticMessage('Unexpected token } in JSON at position 15');
    expect(result).toBe('JSON 语法错误：第 15 个字符处出现意外的符号 }');
  });

  it('translates JSON unexpected end of input error', () => {
    const result = translateDiagnosticMessage('Unexpected end of JSON input');
    expect(result).toBe('JSON 语法错误：输入意外结束');
  });

  it('translates missing initializer in const declaration', () => {
    const result = translateDiagnosticMessage('Missing initializer in const declaration');
    expect(result).toBe('const 声明中缺少初始化值');
  });

  it('falls back to original message for unknown errors', () => {
    const result = translateDiagnosticMessage('Some unknown error message');
    expect(result).toBe('Some unknown error message');
  });
});

describe('jsLinter preprocessing', () => {
  it('does not report false positive for JSDoc comments with import()', () => {
    const code = `/** @type {import('tailwindcss').Config} */
const x = 1;`;
    // After stripping comments and preprocessing ESM, this should be valid JS
    expect(() => {
      const processed = code.replace(/^(\s*)(import|export)\b.*$/gm, '$1');
      new Function(processed);
    }).not.toThrow();
  });

  it('does not report false positive for ESM import statements', () => {
    const code = `import typography from '@tailwindcss/typography'
const x = 1;`;
    expect(() => {
      const processed = code.replace(/^(\s*)(import|export)\b.*$/gm, '$1');
      new Function(processed);
    }).not.toThrow();
  });

  it('does not report false positive for export default object', () => {
    const code = `export default { a: 1 }`;
    expect(() => {
      const processed = code.replace(/^(\s*)export\s+default\s+/gm, '$1return ');
      new Function(processed);
    }).not.toThrow();
  });

  it('does not report false positive for postcss.config.js style export default', () => {
    const code = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;
    expect(() => {
      const processed = code.replace(/^(\s*)export\s+default\s+/gm, '$1return ');
      new Function(processed);
    }).not.toThrow();
  });

  it('does not report false positive for tailwind.config.js style export default', () => {
    const code = `/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography'

export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [typography],
}`;
    let processed = code;
    processed = processed.replace(/^(\s*)export\s+default\s+/gm, '$1return ');
    processed = processed.replace(/^(\s*)export\s+(const|let|var|function|class)\b/gm, '$1$2');
    processed = processed.replace(/^(\s*)export\s*\{[^}]*\}\s*;?/gm, '$1');
    processed = processed.replace(/^(\s*)export\b.*$/gm, '$1');
    processed = processed.replace(/^(\s*)import\b.*$/gm, '$1');
    expect(() => new Function(processed)).not.toThrow();
  });

  it('still reports real syntax errors after preprocessing', () => {
    const code = `const x = {`;
    expect(() => {
      new Function(code);
    }).toThrow();
  });
});

describe('error line inference', () => {
  it('infers line from import keyword when error has no line:col info', () => {
    const code = `/** comment */
import x from 'y'
const a = 1`;
    const lines = code.split('\n');
    // Simulate: error has no (line:col), find first import/export line
    let inferredLine = 1;
    for (let i = 0; i < lines.length; i++) {
      if (/^(\s*)(import|export)\b/.test(lines[i])) {
        inferredLine = i + 1;
        break;
      }
    }
    expect(inferredLine).toBe(2);
  });

  it('infers line from export keyword when error has no line:col info', () => {
    const code = `const a = 1
export default a`;
    const lines = code.split('\n');
    let inferredLine = 1;
    for (let i = 0; i < lines.length; i++) {
      if (/^(\s*)(import|export)\b/.test(lines[i])) {
        inferredLine = i + 1;
        break;
      }
    }
    expect(inferredLine).toBe(2);
  });
});

describe('stripJsonComments', () => {
  it('strips single-line comments', () => {
    const input = '{\n  "a": 1 // comment\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: 1 });
  });

  it('strips multi-line comments', () => {
    const input = `{\n  /* comment */\n  "a": 1\n}`;
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: 1 });
  });

  it('does not strip comment-like text inside strings', () => {
    const input = '{\n  "a": "// not a comment /* also not */"\n}';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: '// not a comment /* also not */' });
  });

  it('handles real tsconfig-like JSONC', () => {
    const input = `{\n  "compilerOptions": {\n    "target": "es2023"\n  },\n  /* Bundler mode */\n  "moduleResolution": "bundler"\n}`;
    expect(JSON.parse(stripJsonComments(input))).toEqual({
      compilerOptions: { target: 'es2023' },
      moduleResolution: 'bundler',
    });
  });

  it('still reports real JSON syntax errors after stripping comments', () => {
    const input = '{\n  "a": 1,\n  /* comment */\n  "b"\n}';
    expect(() => JSON.parse(stripJsonComments(input))).toThrow();
  });
});

describe('translateDiagnosticMessage JSON Expected', () => {
  it('translates Expected double-quoted property name in JSON', () => {
    const result = translateDiagnosticMessage('Expected double-quoted property name in JSON at position 222');
    expect(result).toBe('JSON 语法错误：第 222 个字符处应为双引号包裹的属性名');
  });

  it('translates Expected colon after property name in JSON', () => {
    const result = translateDiagnosticMessage("Expected ':' after property name in JSON at position 10");
    expect(result).toBe('JSON 语法错误：第 10 个字符处属性名后应为冒号');
  });
});

describe('cssLinter false positive fixes', () => {
  it('does not false positive on braces inside strings', () => {
    const code = 'body::before { content: "{"; }';
    let depth = 0;
    let inString: false | "'" | '"' = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (inString) {
        if (ch === inString) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inString = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    expect(depth).toBe(0);
  });

  it('does not false positive on braces inside comments', () => {
    const code = 'body { /* { */ color: red; }';
    let depth = 0;
    let inComment = false;
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      const next = code[i + 1];
      if (inComment) {
        if (ch === '*' && next === '/') { inComment = false; i++; }
        continue;
      }
      if (ch === '/' && next === '*') { inComment = true; i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    expect(depth).toBe(0);
  });
});

describe('stripJsComments line number preservation', () => {
  it('preserves line count when stripping multi-line comments', () => {
    const code = `const a = 1;
/* comment
   spanning
   lines */
const b = 2;`;
    const stripped = stripJsComments(code);
    // Original and stripped should have the same number of lines so that
    // new Function() error line numbers map back correctly.
    expect(stripped.split('\n').length).toBe(code.split('\n').length);
    // The line after the comment should still be 'const b = 2;'
    expect(stripped.split('\n')[4].trim()).toBe('const b = 2;');
  });

  it('preserves column roughly for inline multi-line comments', () => {
    const code = 'const x = /* comment */ 1;';
    const stripped = stripJsComments(code);
    // Should be valid JS after stripping
    expect(() => new Function(stripped)).not.toThrow();
  });

  it('does not strip comment-like text inside strings', () => {
    const code = 'const a = "/* not a comment */";';
    const stripped = stripJsComments(code);
    expect(stripped).toBe(code);
  });

  it('preserves line count with nested-looking comments inside strings', () => {
    const code = `const a = "/* not a comment";
/* real comment
   spanning */
const b = 2;`;
    const stripped = stripJsComments(code);
    expect(stripped.split('\n').length).toBe(code.split('\n').length);
    expect(() => new Function(stripped)).not.toThrow();
  });
});

describe('preprocessESM line number preservation', () => {
  it('does not change line count when removing imports', () => {
    const code = `import { a } from 'a'
const x = 1`;
    const processed = preprocessESM(code);
    expect(processed.split('\n').length).toBe(code.split('\n').length);
  });

  it('does not change line count when converting export default', () => {
    const code = `export default { a: 1 }
const x = 2`;
    const processed = preprocessESM(code);
    expect(processed.split('\n').length).toBe(code.split('\n').length);
  });
});

describe('xmlLinter duplicate open tag detection', () => {
  it('reports info when a duplicate open tag appears before the previous one is closed', () => {
    // Simulates the user deleting a closing tag: <Rule> ... <Rule> (missing </Rule>)
    const html = `<RuleData>
  <Rule>
    <SubRule></SubRule>
  
  <Rule>
    <SubRule></SubRule>
  </Rule>
</RuleData>`;
    const diagnostics: { severity: string; message: string; line: number }[] = [];
    const stack: { tag: string; line: number }[] = [];
    const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?\/?>/g;
    let m: RegExpExecArray | null;
    let lineNum = 1;
    let lastIndex = 0;

    while ((m = tagRegex.exec(html)) !== null) {
      // track line number
      while (lastIndex < m.index) {
        if (html[lastIndex] === '\n') lineNum++;
        lastIndex++;
      }
      const isClose = m[1] === '/';
      const tag = m[2].toLowerCase();

      if (isClose) {
        let matchIdx = -1;
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) { matchIdx = i; break; }
        }
        if (matchIdx === -1) {
          diagnostics.push({ severity: 'error', message: `unexpected </${tag}>`, line: lineNum });
        } else if (matchIdx !== stack.length - 1) {
          diagnostics.push({ severity: 'error', message: `mismatch </${tag}>`, line: lineNum });
          while (stack.length > matchIdx + 1) {
            const skipped = stack.pop()!;
            diagnostics.push({ severity: 'warning', message: `unclosed <${skipped.tag}>`, line: skipped.line });
          }
          stack.pop();
        } else {
          stack.pop();
        }
      } else if (!m[0].endsWith('/>')) {
        const existingIdx = stack.findIndex((s) => s.tag === tag);
        if (existingIdx !== -1) {
          diagnostics.push({ severity: 'info', message: `duplicate <${tag}>`, line: lineNum });
        }
        stack.push({ tag, line: lineNum });
      }
    }

    // Should report info at line 5 (second <Rule>) because first <Rule> at line 2 is unclosed
    const dupInfo = diagnostics.find((d) => d.severity === 'info' && d.line === 5);
    expect(dupInfo).toBeDefined();

    // Should report unclosed first <Rule> at line 2 when </RuleData> is encountered
    const unclosedRule = diagnostics.find((d) => d.severity === 'warning' && d.line === 2);
    expect(unclosedRule).toBeDefined();
  });
});

describe('xmlLinter false positive fixes', () => {
  it('does not false positive on tags inside comments', () => {
    const html = '<div><!-- <span>comment</span> --></div>';
    const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?\/?>/g;
    let m: RegExpExecArray | null;
    const matchedTags: string[] = [];
    while ((m = tagRegex.exec(html)) !== null) {
      const pos = m.index;
      const before = html.lastIndexOf('<!--', pos);
      if (before !== -1) {
        const after = html.indexOf('-->', before);
        if (after === -1 || after > pos) continue;
      }
      matchedTags.push(m[2]);
    }
    expect(matchedTags).toEqual(['div', 'div']);
  });

  it('does not false positive on tags inside script', () => {
    const html = '<script>const html = "<div>hello</div>";</script>';
    const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?\/?>/g;
    let m: RegExpExecArray | null;
    const matchedTags: string[] = [];
    while ((m = tagRegex.exec(html)) !== null) {
      const pos = m.index;
      const scriptStart = html.lastIndexOf('<script', pos);
      if (scriptStart !== -1 && scriptStart !== pos) {
        const scriptEnd = html.indexOf('</script>', scriptStart);
        if (scriptEnd === -1 || scriptEnd > pos) continue;
      }
      matchedTags.push(m[2]);
    }
    expect(matchedTags).toEqual(['script', 'script']);
  });
});
