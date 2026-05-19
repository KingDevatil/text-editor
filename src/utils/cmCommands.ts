import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

/**
 * Go to definition (simplified): find the first occurrence of the word
 * under cursor and jump to it. If already at the first occurrence,
 * cycles to the next one.
 */
export function goToDefinition(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const word = view.state.wordAt(pos);
  if (!word || word.from === word.to) return false;

  const target = view.state.doc.sliceString(word.from, word.to);
  if (!target || target.length < 2) return false;

  // Search all occurrences
  const text = view.state.doc.toString();
  const occurrences: number[] = [];
  let idx = text.indexOf(target);
  while (idx !== -1) {
    // Ensure whole-word match by checking boundaries
    const before = idx === 0 || !/[a-zA-Z0-9_]/.test(text[idx - 1]);
    const after = idx + target.length >= text.length || !/[a-zA-Z0-9_]/.test(text[idx + target.length]);
    if (before && after) {
      occurrences.push(idx);
    }
    idx = text.indexOf(target, idx + 1);
  }

  if (occurrences.length <= 1) return false;

  // Find current occurrence index
  let currentIdx = occurrences.findIndex((o) => o === word.from);
  if (currentIdx === -1) currentIdx = 0;

  // Jump to next occurrence (cycle)
  const nextIdx = (currentIdx + 1) % occurrences.length;
  const nextPos = occurrences[nextIdx];

  view.dispatch({
    selection: { anchor: nextPos, head: nextPos + target.length },
    effects: EditorView.scrollIntoView(nextPos, { y: 'center' }),
  });

  return true;
}

/**
 * Detect the format of a text snippet by its content.
 * Supports fragments (e.g. a single line from a JSON file, multi-line selections).
 */
function detectFormat(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // JSON: starts with { or [, or contains typical JSON patterns
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    if (trimmed.length > 2) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        // not valid JSON as-is, but may still be JSON-like
      }
    }
  }

  // JSON fragment detection: contains key-value pairs with quotes and colons
  if (/"[^"]+":\s*"/.test(trimmed) || /"[^"]+":\s*[[{\d]/.test(trimmed)) {
    // Try wrapping in { } or [ ] and parsing
    const candidates = [`{${trimmed}}`, `[${trimmed}]`, trimmed];
    for (const candidate of candidates) {
      try {
        JSON.parse(candidate);
        return 'json';
      } catch {
        // try next
      }
    }
  }

  // XML / HTML
  if (trimmed.startsWith('<') || trimmed.includes('</') || trimmed.includes('/>')) return 'xml';

  // SQL
  if (/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|JOIN|WHERE|FROM|TABLE|INDEX)\b/i.test(trimmed)) return 'sql';

  // CSS
  if (/[-a-zA-Z0-9_#.*:[\]]+\s*\{/.test(trimmed) && trimmed.includes(':')) return 'css';

  return null;
}

/**
 * Dispatch a format command based on the current language or selection content.
 * @param scope 'full' = entire document, 'selection' = selected text only (falls back to current line if no selection)
 * Returns true if formatting was applied.
 */
export function formatDocument(view: EditorView, language: string, scope: 'full' | 'selection' = 'full'): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const hasSelection = sel.from !== sel.to;

  // For 'selection' scope: if nothing selected, try to expand to the current line
  let from = sel.from;
  let to = sel.to;

  if (scope === 'selection') {
    if (!hasSelection) {
      // No selection — expand to the current line
      const line = state.doc.lineAt(sel.from);
      from = line.from;
      to = line.to;
    }
    const text = state.doc.sliceString(from, to).trim();
    if (!text) return false;

    // Try current language first
    const ok = tryFormat(view, language, from, to);
    if (ok) return true;

    // Fallback: detect format from content
    const detected = detectFormat(text);
    if (detected) {
      return tryFormat(view, detected, from, to);
    }
    return false;
  }

  // 'full' scope: format entire document
  const fullOk = tryFormat(view, language, 0, state.doc.length);
  if (fullOk) return true;

  // Fallback: if current language doesn't support formatting, try to detect from full document
  const fullText = state.doc.toString().trim();
  if (fullText) {
    const detected = detectFormat(fullText);
    if (detected) {
      return tryFormat(view, detected, 0, state.doc.length);
    }
  }

  return false;
}

function tryFormat(view: EditorView, format: string, from: number, to: number): boolean {
  const text = view.state.doc.sliceString(from, to);

  switch (format) {
    case 'json': {
      const cleaned = text.replace(/,\s*([}\]])/g, '$1');
      try {
        const parsed = JSON.parse(cleaned);
        const formatted = JSON.stringify(parsed, null, 2);
        view.dispatch({
          changes: { from, to, insert: formatted },
          selection: EditorSelection.cursor(from + formatted.length),
        });
        return true;
      } catch {
        return false;
      }
    }
    case 'jsonl': {
      const lines = text.split('\n');
      const formattedLines: string[] = [];
      let hasError = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          formattedLines.push('');
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed);
          formattedLines.push(JSON.stringify(parsed, null, 2));
        } catch {
          hasError = true;
          break;
        }
      }
      if (!hasError) {
        const formatted = formattedLines.join('\n');
        view.dispatch({
          changes: { from, to, insert: formatted },
          selection: EditorSelection.cursor(from + formatted.length),
        });
        return true;
      }
      return false;
    }
    case 'xml':
    case 'html': {
      const formatted = formatXMLText(text);
      if (formatted === null) return false;
      view.dispatch({
        changes: { from, to, insert: formatted },
        selection: EditorSelection.cursor(from + formatted.length),
      });
      return true;
    }
    case 'sql': {
      const formatted = formatSQLText(text);
      view.dispatch({
        changes: { from, to, insert: formatted },
        selection: EditorSelection.cursor(from + formatted.length),
      });
      return true;
    }
    case 'css': {
      const formatted = formatCSText(text);
      if (formatted === null) return false;
      view.dispatch({
        changes: { from, to, insert: formatted },
        selection: EditorSelection.cursor(from + formatted.length),
      });
      return true;
    }
    case 'javascript':
    case 'typescript': {
      const formatted = formatJSText(text);
      if (formatted === null) return false;
      view.dispatch({
        changes: { from, to, insert: formatted },
        selection: EditorSelection.cursor(from + formatted.length),
      });
      return true;
    }
    default:
      return false;
  }
}

function formatXMLText(text: string): string | null {
  let formatted = '';
  let indent = 0;
  const indentStr = '  ';
  const tokens = text.split(/(<\/?[^>]+>)/g);
  for (const token of tokens) {
    if (!token) continue;
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      formatted += indentStr.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('<')) {
      if (!trimmed.endsWith('/>') && !trimmed.match(/<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)/i)) {
        formatted += indentStr.repeat(indent) + trimmed + '\n';
        indent++;
      } else {
        formatted += indentStr.repeat(indent) + trimmed + '\n';
      }
    } else {
      const lines = trimmed.split(/\n/).filter((l) => l.trim());
      for (const line of lines) {
        formatted += indentStr.repeat(indent) + line.trim() + '\n';
      }
    }
  }
  return formatted.trim() + '\n';
}

function formatSQLText(text: string): string {
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE',
    'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
    'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
    'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
    'AS', 'DISTINCT', 'UNION', 'ALL', 'VALUES', 'SET', 'INTO',
  ];
  const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
  return text
    .replace(keywordRegex, (match) => match.toUpperCase())
    .replace(/;/g, ';\n')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

function formatCSText(text: string): string | null {
  let result = '';
  let indent = 0;
  const indentStr = '  ';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === stringChar) inString = false;
      result += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      continue;
    }
    if (ch === '{') {
      result += ' ' + ch + '\n' + indentStr.repeat(++indent);
    } else if (ch === '}') {
      result += '\n' + indentStr.repeat(--indent) + ch + '\n' + indentStr.repeat(indent);
    } else if (ch === ';') {
      result += ch + '\n' + indentStr.repeat(indent);
    } else if (ch === '\n' || ch === '\t') {
      // collapse original whitespace
    } else if (ch === ' ') {
      if (result.length > 0 && !/\s$/.test(result)) result += ' ';
    } else {
      result += ch;
    }
  }
  return result.trim();
}

function formatJSText(text: string): string | null {
  let result = '';
  let indent = 0;
  const indentStr = '  ';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] || '';
    if (inLineComment) {
      result += ch;
      if (ch === '\n') {
        inLineComment = false;
        result += indentStr.repeat(indent);
      }
      continue;
    }
    if (inBlockComment) {
      result += ch;
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        result += next;
        i++;
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === stringChar) inString = false;
      result += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      result += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      result += ch;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      result += ch;
      continue;
    }
    if (ch === '{' || ch === '[') {
      result += ch + '\n' + indentStr.repeat(++indent);
    } else if (ch === '}' || ch === ']') {
      result += '\n' + indentStr.repeat(--indent) + ch;
    } else if (ch === ';') {
      result += ch + '\n' + indentStr.repeat(indent);
    } else if (ch === ',') {
      result += ch + ' ';
    } else if (ch === '\n' || ch === '\t') {
      // ignore original whitespace
    } else if (ch === ' ') {
      if (result.length > 0 && !/\s$/.test(result)) result += ' ';
    } else {
      result += ch;
    }
  }
  return result.trim();
}
