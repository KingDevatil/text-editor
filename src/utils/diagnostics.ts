import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';

export interface DiagnosticEngine {
  readonly name: string;
  readonly supportedLanguages: readonly string[];
  run(view: EditorView): Diagnostic[];
}

export interface FileTier {
  readonly label: string;
  readonly maxBytes: number;
  readonly pollIntervalMs: number;
  readonly skip: boolean;
}

const tiers: FileTier[] = [
  { label: 'small', maxBytes: 100_000, pollIntervalMs: 300, skip: false },
  { label: 'medium', maxBytes: 500_000, pollIntervalMs: 500, skip: false },
  { label: 'large', maxBytes: 2_000_000, pollIntervalMs: 1000, skip: false },
  { label: 'xlarge', maxBytes: Infinity, pollIntervalMs: 0, skip: true },
];

export function getFileTier(docLength: number): FileTier {
  for (const tier of tiers) {
    if (docLength <= tier.maxBytes) return tier;
  }
  return tiers[tiers.length - 1];
}

export function getPollInterval(docLength: number): number {
  return getFileTier(docLength).pollIntervalMs;
}

export function shouldSkipDiagnostics(docLength: number): boolean {
  return getFileTier(docLength).skip;
}

const engines = new Map<string, DiagnosticEngine>();

export function registerDiagnosticEngine(engine: DiagnosticEngine): void {
  for (const lang of engine.supportedLanguages) {
    engines.set(lang, engine);
  }
}

export function getDiagnosticEngine(language: string): DiagnosticEngine | undefined {
  return engines.get(language);
}

export function hasDiagnosticEngine(language: string): boolean {
  return engines.has(language);
}

/**
 * Translate common English diagnostic messages from runtime parsers into Chinese.
 * Falls back to the original message if no known pattern matches.
 */
export function translateDiagnosticMessage(message: string): string {
  const m = message.trim();

  // JSON.parse errors
  if (/Unexpected token .* in JSON at position \d+/i.test(m)) {
    return m.replace(/Unexpected token (.*?) in JSON at position (\d+)/i, 'JSON 语法错误：第 $2 个字符处出现意外的符号 $1');
  }
  if (/Unexpected end of JSON input/i.test(m)) {
    return 'JSON 语法错误：输入意外结束';
  }
  if (/Unexpected non-whitespace character after JSON at position (\d+)/i.test(m)) {
    return `JSON 语法错误：第 ${m.match(/position (\d+)/i)![1]} 个字符处出现意外的非空白字符（可能是 JSON Lines 格式，建议改用 .jsonl 后缀）`;
  }
  if (/Unexpected .* in JSON at position \d+/i.test(m)) {
    return m.replace(/Unexpected (.*?) in JSON at position (\d+)/i, 'JSON 语法错误：第 $2 个字符处出现意外的 $1');
  }
  if (/Expected double-quoted property name in JSON at position (\d+)/i.test(m)) {
    return `JSON 语法错误：第 ${m.match(/position (\d+)/i)![1]} 个字符处应为双引号包裹的属性名`;
  }
  if (/Expected ',' or '}' after property value in JSON at position (\d+)/i.test(m)) {
    return `JSON 语法错误：第 ${m.match(/position (\d+)/i)![1]} 个字符处属性值后应为逗号或右花括号`;
  }
  if (/Expected ':' after property name in JSON at position (\d+)/i.test(m)) {
    return `JSON 语法错误：第 ${m.match(/position (\d+)/i)![1]} 个字符处属性名后应为冒号`;
  }
  if (/Expected property name or '}' in JSON at position (\d+)/i.test(m)) {
    return `JSON 语法错误：第 ${m.match(/position (\d+)/i)![1]} 个字符处应为属性名或右花括号`;
  }
  if (/Expected (.*?) in JSON at position (\d+)/i.test(m)) {
    return m.replace(/Expected (.*?) in JSON at position (\d+)/i, 'JSON 语法错误：第 $2 个字符处应为 $1');
  }
  if (/Bad (.*?) in JSON at position (\d+)/i.test(m)) {
    return m.replace(/Bad (.*?) in JSON at position (\d+)/i, 'JSON 语法错误：第 $2 个字符处存在错误的 $1');
  }

  // JS/TS syntax errors from new Function()
  if (/Unexpected token ['"]?(.+?)['"]?/i.test(m) && !m.includes('JSON')) {
    return m.replace(/Unexpected token ['"]?(.+?)['"]?/i, "意外的符号 '$1'");
  }
  if (/Missing \) after argument list/i.test(m)) {
    return '参数列表后缺少右括号';
  }
  if (/Missing ; before statement/i.test(m)) {
    return '语句前缺少分号';
  }
  if (/Unterminated string constant/i.test(m)) {
    return '字符串未闭合';
  }
  if (/Unexpected identifier/i.test(m)) {
    return '意外的标识符';
  }
  if (/Unexpected end of input/i.test(m)) {
    return '输入意外结束';
  }
  if (/Unexpected reserved word/i.test(m)) {
    return '意外的保留字';
  }
  if (/Unexpected number/i.test(m)) {
    return '意外的数字';
  }
  if (/Unexpected string/i.test(m)) {
    return '意外的字符串';
  }
  if (/Missing initializer in (const|let|var) declaration/i.test(m)) {
    return m.replace(/Missing initializer in (const|let|var) declaration/i, '$1 声明中缺少初始化值');
  }
  if (/Missing initializer in destructuring declaration/i.test(m)) {
    return '解构声明中缺少初始化值';
  }
  if (/Illegal return statement/i.test(m)) {
    return '非法的 return 语句';
  }
  if (/Invalid or unexpected token/i.test(m)) {
    return '无效或意外的符号';
  }
  if (/Invalid regular expression/i.test(m)) {
    return '无效的正则表达式';
  }
  if (/Cannot use import statement outside a module/i.test(m)) {
    return '不能在模块外部使用 import 语句（检测器不支持 ESM 模块语法）';
  }
  if (/Unexpected token 'import'/i.test(m)) {
    return "意外的符号 'import'（检测器不支持 ESM 模块语法）";
  }

  return m;
}
