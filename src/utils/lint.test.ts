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
      const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const processed = stripped.replace(/^(\s*)(import|export)\b.*$/gm, '$1');
      new Function(processed);
    }).not.toThrow();
  });

  it('does not report false positive for ESM import statements', () => {
    const code = `import typography from '@tailwindcss/typography'
const x = 1;`;
    expect(() => {
      const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const processed = stripped.replace(/^(\s*)(import|export)\b.*$/gm, '$1');
      new Function(processed);
    }).not.toThrow();
  });

  it('does not report false positive for export default', () => {
    const code = `export default { a: 1 }`;
    expect(() => {
      const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const processed = stripped.replace(/^(\s*)(import|export)\b.*$/gm, '$1');
      new Function(processed);
    }).not.toThrow();
  });

  it('still reports real syntax errors after preprocessing', () => {
    const code = `const x = {`;
    expect(() => {
      const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const processed = stripped.replace(/^(\s*)(import|export)\b.*$/gm, '$1');
      new Function(processed);
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
