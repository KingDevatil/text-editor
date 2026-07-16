import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import {
  applyEdits,
  format as formatJsonc,
  parseTree,
  type ParseError,
} from 'jsonc-parser';

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

  const applyFormattedText = (formatted: string): boolean => {
    if (formatted === text) return true;
    view.dispatch({
      changes: { from, to, insert: formatted },
      selection: EditorSelection.cursor(from + formatted.length),
    });
    return true;
  };

  switch (format) {
    case 'json': {
      try {
        const errors: ParseError[] = [];
        const tree = parseTree(text, errors, {
          allowTrailingComma: true,
          disallowComments: false,
        });
        if (!tree || errors.length > 0) return false;
        const formatted = applyEdits(text, formatJsonc(text, undefined, {
          insertSpaces: true,
          tabSize: 2,
          eol: '\n',
          keepLines: false,
        }));
        return applyFormattedText(formatted);
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
          // JSON Lines requires one complete JSON value per physical line.
          formattedLines.push(JSON.stringify(parsed));
        } catch {
          hasError = true;
          break;
        }
      }
      if (!hasError) {
        const formatted = formattedLines.join('\n');
        return applyFormattedText(formatted);
      }
      return false;
    }
    case 'xml':
    case 'html': {
      const formatted = formatXMLText(text);
      if (formatted === null) return false;
      return applyFormattedText(formatted);
    }
    case 'sql': {
      const formatted = formatSQLText(text);
      return applyFormattedText(formatted);
    }
    case 'css': {
      const formatted = formatCSText(text);
      if (formatted === null) return false;
      return applyFormattedText(formatted);
    }
    case 'javascript':
    case 'typescript': {
      const formatted = formatJSText(text);
      if (formatted === null) return false;
      return applyFormattedText(formatted);
    }
    default:
      return false;
  }
}

function tokenizeMarkup(text: string): string[] | null {
  const tokens: string[] = [];
  const lowerText = text.toLowerCase();
  let index = 0;
  let rawTag: 'script' | 'style' | null = null;

  while (index < text.length) {
    if (rawTag) {
      const closeStart = lowerText.indexOf(`</${rawTag}`, index);
      if (closeStart === -1) return null;
      if (closeStart > index) tokens.push(text.slice(index, closeStart));
      index = closeStart;
      rawTag = null;
    }

    if (text[index] !== '<') {
      const nextTag = text.indexOf('<', index);
      const end = nextTag === -1 ? text.length : nextTag;
      tokens.push(text.slice(index, end));
      index = end;
      continue;
    }

    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);
      if (end === -1) return null;
      tokens.push(text.slice(index, end + 3));
      index = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', index)) {
      const end = text.indexOf(']]>', index + 9);
      if (end === -1) return null;
      tokens.push(text.slice(index, end + 3));
      index = end + 3;
      continue;
    }

    let quote: '"' | "'" | null = null;
    let tagEnd = index + 1;
    for (; tagEnd < text.length; tagEnd++) {
      const char = text[tagEnd];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
    }
    if (tagEnd >= text.length) return null;

    const tag = text.slice(index, tagEnd + 1);
    tokens.push(tag);
    const rawOpen = tag.match(/^<(script|style)(?:\s|>)/i);
    if (rawOpen && !tag.endsWith('/>')) {
      rawTag = rawOpen[1].toLowerCase() as 'script' | 'style';
    }
    index = tagEnd + 1;
  }

  return tokens;
}

function formatXMLText(text: string): string | null {
  // Leading and trailing whitespace is document content in these elements.
  if (/<(?:pre|textarea)(?:\s|>)/i.test(text)) return null;
  let formatted = '';
  let indent = 0;
  const indentStr = '  ';
  const tokens = tokenizeMarkup(text);
  if (!tokens) return null;
  for (const token of tokens) {
    if (!token) continue;
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (/^<!|^<\?/.test(trimmed)) {
      // Doctype, comments, CDATA and processing instructions don't open a level.
      formatted += indentStr.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      formatted += indentStr.repeat(indent) + trimmed + '\n';
    } else if (trimmed.startsWith('<')) {
      if (!trimmed.endsWith('/>') && !trimmed.match(/^<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)(?:\s|\/?>)/i)) {
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
  const keywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE',
    'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER',
    'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
    'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
    'AS', 'DISTINCT', 'UNION', 'ALL', 'VALUES', 'SET', 'INTO',
  ]);
  let result = '';

  for (let index = 0; index < text.length;) {
    const char = text[index];
    const next = text[index + 1] || '';

    if (char === '-' && next === '-') {
      const end = text.indexOf('\n', index + 2);
      const commentEnd = end === -1 ? text.length : end;
      result += text.slice(index, commentEnd);
      index = commentEnd;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = text.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? text.length : end + 2;
      result += text.slice(index, commentEnd);
      index = commentEnd;
      continue;
    }

    if (char === '$') {
      const delimiter = text.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (delimiter) {
        const end = text.indexOf(delimiter, index + delimiter.length);
        if (end !== -1) {
          const literalEnd = end + delimiter.length;
          result += text.slice(index, literalEnd);
          index = literalEnd;
          continue;
        }
      }
    }

    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === '\\') {
          end += 2;
          continue;
        }
        if (text[end] === quote) {
          if (text[end + 1] === quote) {
            end += 2;
            continue;
          }
          end++;
          break;
        }
        end++;
      }
      result += text.slice(index, end);
      index = end;
      continue;
    }

    if (char === '[') {
      const end = text.indexOf(']', index + 1);
      const identifierEnd = end === -1 ? text.length : end + 1;
      result += text.slice(index, identifierEnd);
      index = identifierEnd;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (/[A-Za-z0-9_$]/.test(text[end] || '')) end++;
      const word = text.slice(index, end);
      result += keywords.has(word.toUpperCase()) ? word.toUpperCase() : word;
      index = end;
      continue;
    }

    if (char === ';') {
      result += ';\n';
      index++;
      continue;
    }

    result += char;
    index++;
  }

  return result.trim();
}

function formatCSText(text: string): string | null {
  let result = '';
  let indent = 0;
  const indentStr = '  ';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let inBlockComment = false;
  let parenDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] || '';
    if (inBlockComment) {
      result += ch;
      if (ch === '*' && next === '/') {
        result += next;
        i++;
        inBlockComment = false;
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
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      result += ch + next;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      continue;
    }
    if (ch === '(') {
      parenDepth++;
      result += ch;
    } else if (ch === ')') {
      if (parenDepth === 0) return null;
      parenDepth--;
      result += ch;
    } else if (ch === '{' && parenDepth === 0) {
      result = result.trimEnd() + ' ' + ch + '\n' + indentStr.repeat(++indent);
    } else if (ch === '}' && parenDepth === 0) {
      if (indent === 0) return null;
      indent--;
      result = result.trimEnd() + '\n' + indentStr.repeat(indent) + ch + '\n' + indentStr.repeat(indent);
    } else if (ch === ';' && parenDepth === 0) {
      result += ch + '\n' + indentStr.repeat(indent);
    } else if (ch === '\n' || ch === '\r') {
      if (!result.endsWith('\n')) {
        result = result.trimEnd() + '\n' + indentStr.repeat(indent);
      }
    } else if (ch === '\t') {
      if (result.length > 0 && !/\s$/.test(result)) result += ' ';
    } else if (ch === ' ') {
      if (result.length > 0 && !/\s$/.test(result)) result += ' ';
    } else {
      result += ch;
    }
  }
  if (indent !== 0 || parenDepth !== 0 || inString || inBlockComment) return null;
  return result.trim();
}

function formatJSText(text: string): string | null {
  // A conservative formatter is preferable to token rewriting: preserving
  // physical line boundaries avoids changing automatic-semicolon-insertion
  // semantics. Template literals are left untouched until a parser-backed
  // formatter is available because their leading whitespace is content.
  if (text.includes('`')) return null;

  const indentStr = '  ';
  const stack: string[] = [];
  let inBlockComment = false;
  const matching: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const openers = new Set(['(', '[', '{']);
  const closers = new Set([')', ']', '}']);
  const formattedLines: string[] = [];

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      formattedLines.push('');
      continue;
    }

    const tokens: Array<{ char: string; index: number }> = [];
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (let index = 0; index < trimmed.length; index++) {
      const char = trimmed[index];
      const next = trimmed[index + 1] || '';

      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          index++;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '/' && next === '/') break;
      if (char === '/' && next === '*') {
        inBlockComment = true;
        index++;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '/') {
        const prefix = trimmed.slice(0, index).trimEnd();
        const previous = prefix.at(-1);
        const likelyRegex = !previous || '=(:,!&|?{};['.includes(previous);
        if (likelyRegex) {
          let regexEscaped = false;
          let inCharacterClass = false;
          let closed = false;
          for (index++; index < trimmed.length; index++) {
            const regexChar = trimmed[index];
            if (regexEscaped) regexEscaped = false;
            else if (regexChar === '\\') regexEscaped = true;
            else if (regexChar === '[') inCharacterClass = true;
            else if (regexChar === ']') inCharacterClass = false;
            else if (regexChar === '/' && !inCharacterClass) {
              closed = true;
              while (/[a-z]/i.test(trimmed[index + 1] || '')) index++;
              break;
            }
          }
          if (!closed) return null;
          continue;
        }
      }
      if (openers.has(char) || closers.has(char)) tokens.push({ char, index });
    }

    if (quote) return null;
    let leadingClosers = 0;
    for (const token of tokens) {
      if (token.index !== leadingClosers || !closers.has(token.char)) break;
      leadingClosers++;
    }
    if (leadingClosers > stack.length) return null;
    formattedLines.push(indentStr.repeat(stack.length - leadingClosers) + trimmed);

    for (const token of tokens) {
      if (openers.has(token.char)) {
        stack.push(token.char);
      } else {
        const expected = matching[token.char];
        if (stack.at(-1) !== expected) return null;
        stack.pop();
      }
    }
  }

  if (inBlockComment || stack.length > 0) return null;
  return formattedLines.join('\n').trim();
}
