import { linter, type Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { registerDiagnosticEngine, getDiagnosticEngine, translateDiagnosticMessage } from './diagnostics';

const LINT_MAX_SIZE = 2_000_000; // Skip linting for files > 2MB

/**
 * JSON linter — uses JSON.parse() to detect syntax errors.
 */
function jsonLinter(view: EditorView): Diagnostic[] {
  if (view.state.doc.length > LINT_MAX_SIZE) return [];
  const text = view.state.doc.toString();
  if (!text.trim()) return [];

  try {
    JSON.parse(text);
    return [];
  } catch (e) {
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
 * Strip JS single-line and multi-line comments.
 * Lightweight — may affect strings containing comment markers, but acceptable for a linter.
 */
function stripComments(code: string): string {
  return code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Replace ESM import/export statements with empty lines to avoid false positives
 * from new Function() running in script mode (non-module).
 */
function preprocessESM(code: string): string {
  return code.replace(/^(\s*)(import|export)\b.*$/gm, '$1');
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
  const codeToLint = preprocessESM(stripComments(text));

  try {
    new Function(codeToLint);
    return [];
  } catch (e) {
    // new Function errors look like "Unexpected token '}' (1:15)"
    const match = (e as Error).message.match(/\((\d+):(\d+)\)/);
    let lineNum = 1;
    let col = 0;
    if (match) {
      lineNum = parseInt(match[1], 10);
      col = parseInt(match[2], 10);
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
 * Simple XML/HTML linter — checks for basic tag mismatch.
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
    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase();
    const pos = m.index;

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
 * Simple CSS linter — checks brace balance.
 */
function cssLinter(view: EditorView): Diagnostic[] {
  if (view.state.doc.length > LINT_MAX_SIZE) return [];
  const text = view.state.doc.toString();
  let depth = 0;
  const diagnostics: Diagnostic[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
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
