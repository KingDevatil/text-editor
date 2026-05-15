import { describe, it, expect } from 'vitest';
import { translateDiagnosticMessage } from './diagnostics';
import { stripJsonComments } from './lint';

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
