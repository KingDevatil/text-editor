import { linter, type Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { registerDiagnosticEngine, getDiagnosticEngine, translateDiagnosticMessage } from './diagnostics';

const LINT_MAX_SIZE = 2_000_000; // Skip linting for files > 2MB

/**
 * Strip JSON single-line and multi-line comments while preserving strings.
 * Handles escaped quotes inside strings.
 */
export function stripJsonComments(text: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      result += ch;
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      result += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      result += '\n';
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; // skip trailing /
      continue;
    }
    result += ch;
  }
  return result;
}

/**
 * JSON linter — uses JSON.parse() to detect syntax errors.
 * Supports JSON with Comments (JSONC) by stripping comments first.
 */
function jsonLinter(view: EditorView): Diagnostic[] {
  if (view.state.doc.length > LINT_MAX_SIZE) return [];
  const text = view.state.doc.toString();
  if (!text.trim()) return [];

  try {
    JSON.parse(text);
    return [];
  } catch (e) {
    // JSONC: try stripping comments first to avoid false positives
    try {
      JSON.parse(stripJsonComments(text));
      return [];
    } catch {
      // real syntax error, proceed with original error
    }

    // Try to extract position from error message
    const match = (e as Error).message.match(/position (\d+)/i);
    let pos = 0;
    if (match) {
      pos = parseInt(match[1], 10);
    }

    const line = view.state.doc.lineAt(Math.min(pos, view.state.doc.length));
    return [
      {
        from: line.from,
        to: line.to,
        severity: 'error',
        message: translateDiagnosticMessage((e as Error).message),
      },
    ];
  }
}

/**
 * Strip JS single-line and multi-line comments while preserving strings.
 * Handles single/double quotes and template literals (backticks).
 */
function stripJsComments(code: string): string {
  let result = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    // String / template literal
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      result += ch;
      i++;
      while (i < code.length) {
        if (code[i] === '\\') {
          result += code[i++];
          if (i < code.length) result += code[i++];
        } else if (code[i] === quote) {
          result += code[i++];
          break;
        } else {
          result += code[i++];
        }
      }
      continue;
    }

    // Single-line comment
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      if (i < code.length) result += code[i++];
      continue;
    }

    // Multi-line comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    result += ch;
    i++;
  }
  return result;
}

/**
 * Replace ESM import/export statements so new Function() can parse the code.
 * - import ... -> empty line
 * - export default <expr> -> return (<expr>)
 * - export const/let/var/function/class -> const/let/var/function/class
 * - export { ... } -> empty line
 */
function preprocessESM(code: string): string {
  // export default <expr> -> return <expr>
  code = code.replace(/^(\s*)export\s+default\s+/gm, '$1return ');
  // export const/let/var/function/class -> const/let/var/function/class
  code = code.replace(/^(\s*)export\s+(const|let|var|function|class)\b/gm, '$1$2');
  // export { ... } -> remove
  code = code.replace(/^(\s*)export\s*\{[^}]*\}\s*;?/gm, '$1');
  // remove remaining export statements
  code = code.replace(/^(\s*)export\b.*$/gm, '$1');
  // remove import statements
  code = code.replace(/^(\s*)import\b.*$/gm, '$1');
  return code;
}

/**
 * When new Function() throws an error without (line:col) info,
 * try to infer the relevant line from the original source text.
 */
function inferLineFromErrorMessage(text: string, message: string): number {
  const lower = message.toLowerCase();
  const lines = text.split('\n');
  if (lower.includes('import')) {
    for (let i = 0; i < lines.length; i++) {
      if (/^(\s*)import\b/.test(lines[i])) return i + 1;
    }
  }
  if (lower.includes('export')) {
    for (let i = 0; i < lines.length; i++) {
      if (/^(\s*)export\b/.test(lines[i])) return i + 1;
    }
  }
  return 1;
}

/**
 * JS/TS linter — uses new Function() to detect syntax errors.
 * Very lightweight, catches obvious syntax issues.
 */
function jsLinter(view: EditorView): Diagnostic[] {
  if (view.state.doc.length > LINT_MAX_SIZE) return [];
  const text = view.state.doc.toString();
  if (!text.trim()) return [];

  // Remove comments and preprocess ESM statements to reduce false positives
  const codeToLint = preprocessESM(stripJsComments(text));

  try {
    new Function(codeToLint);
    return [];
  } catch (e) {
    // new Function errors look like "Unexpected token '}' (1:15)"
    const match = (e as Error).message.match(/\((\d+):(\d+)\)/);
    let lineNum: number;
    let col = 0;
    if (match) {
      lineNum = parseInt(match[1], 10);
      col = parseInt(match[2], 10);
    } else {
      lineNum = inferLineFromErrorMessage(text, (e as Error).message);
    }

    const line = view.state.doc.line(Math.min(lineNum, view.state.doc.lines));
    const from = line.from + Math.min(col, line.length);

    return [
      {
        from,
        to: Math.min(from + 1, line.to),
        severity: 'error',
        message: translateDiagnosticMessage((e as Error).message),
      },
    ];
  }
}

/**
 * Check if a position is inside an XML/HTML comment.
 */
function isInsideComment(text: string, pos: number): boolean {
  const before = text.lastIndexOf('<!--', pos);
  if (before === -1) return false;
  const after = text.indexOf('-->', before);
  return after === -1 || after > pos;
}

/**
 * Check if a position is inside a <script> or <style> block.
 * Excludes the opening/closing tags themselves.
 */
function isInsideScriptOrStyle(text: string, pos: number): boolean {
  const scriptStart = text.lastIndexOf('<script', pos);
  if (scriptStart !== -1 && scriptStart !== pos) {
    const scriptEnd = text.indexOf('</script>', scriptStart);
    if (scriptEnd === -1 || scriptEnd > pos) return true;
  }
  const styleStart = text.lastIndexOf('<style', pos);
  if (styleStart !== -1 && styleStart !== pos) {
    const styleEnd = text.indexOf('</style>', styleStart);
    if (styleEnd === -1 || styleEnd > pos) return true;
  }
  return false;
}

/**
 * Simple XML/HTML linter — checks for basic tag mismatch.
 * Skips comments and script/style content to reduce false positives.
 */
function xmlLinter(view: EditorView): Diagnostic[] {
  if (view.state.doc.length > LINT_MAX_SIZE) return [];
  const text = view.state.doc.toString();
  if (!text.trim()) return [];

  const diagnostics: Diagnostic[] = [];
  const stack: { tag: string; from: number }[] = [];
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?\/?>/g;
  let m: RegExpExecArray | null;

  while ((m = tagRegex.exec(text)) !== null) {
    const pos = m.index;
    if (isInsideComment(text, pos) || isInsideScriptOrStyle(text, pos)) {
      continue;
    }

    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase();

    if (isClose) {
      const last = stack.pop();
      if (!last || last.tag !== tag) {
        const line = view.state.doc.lineAt(pos);
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: 'error',
          message: last
            ? `标签不匹配：应为 </${last.tag}>，但遇到 </${tag}>`
            : `意外的关闭标签 </${tag}>`,
        });
      }
    } else if (!m[0].endsWith('/>')) {
      // Self-closing tags don't need matching close
      stack.push({ tag, from: pos });
    }
  }

  // Unclosed tags
  for (const unclosed of stack) {
    const line = view.state.doc.lineAt(unclosed.from);
    diagnostics.push({
      from: line.from,
      to: line.to,
      severity: 'warning',
      message: `未闭合标签 <${unclosed.tag}>`,
    });
  }

  return diagnostics;
}

/**
 * Simple CSS linter — checks brace balance, skipping strings and comments.
 */
function cssLinter(view: EditorView): Diagnostic[] {
  if (view.state.doc.length > LINT_MAX_SIZE) return [];
  const text = view.state.doc.toString();
  let depth = 0;
  const diagnostics: Diagnostic[] = [];
  let inString: false | "'" | '"' = false;
  let inComment = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === inString) {
        inString = false;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') {
      if (depth === 0) {
        const line = view.state.doc.lineAt(i);
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: 'error',
          message: '意外的关闭大括号 }',
        });
      } else {
        depth--;
      }
    }
  }

  if (depth > 0) {
    const lastLine = view.state.doc.line(view.state.doc.lines);
    diagnostics.push({
      from: lastLine.from,
      to: lastLine.to,
      severity: 'error',
      message: `缺少 ${depth} 个关闭大括号`,
    });
  }

  return diagnostics;
}

// Register built-in diagnostic engines
registerDiagnosticEngine({ name: 'json', supportedLanguages: ['json'], run: jsonLinter });
registerDiagnosticEngine({ name: 'js-ts', supportedLanguages: ['javascript', 'typescript'], run: jsLinter });
registerDiagnosticEngine({ name: 'xml-html', supportedLanguages: ['xml', 'html'], run: xmlLinter });
registerDiagnosticEngine({ name: 'css', supportedLanguages: ['css'], run: cssLinter });

/**
 * Return a CM6 linter extension for the given language, or null if none available.
 */
export function getLinterExtension(language: string): Extension | null {
  const engine = getDiagnosticEngine(language);
  if (!engine) return null;
  return linter(engine.run);
}
