import type { Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { ViewPlugin, ViewUpdate, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { Language } from '../types';

// ── Custom INI language support ─────────────────────────────
const iniLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.peek() === '[') {
      stream.skipTo(']');
      stream.eat(']');
      return 'header';
    }
    if (stream.peek() === ';' || stream.peek() === '#') {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/^\s*[a-zA-Z0-9_-]+\s*=/)) {
      return 'keyword';
    }
    stream.skipToEnd();
    return null;
  },
  languageData: {
    commentTokens: { line: ';' },
  },
});

// ── Custom Shell/Bash language support ──────────────────────
const shellLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol() && stream.match(/^#!/)) {
      stream.skipToEnd();
      return 'meta';
    }
    if (stream.peek() === '#') {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.peek() === '"' || stream.peek() === "'") {
      const quote = stream.peek();
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const ch = stream.next();
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quote) {
          break;
        }
      }
      return 'string';
    }
    if (stream.match(/\$\{[^}]*\}/) || stream.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/)) {
      return 'variableName';
    }
    if (stream.match(/\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|break|continue|shift|export|local|readonly|unset)\b/)) {
      return 'keyword';
    }
    if (stream.match(/\b(?:echo|printf|cd|pwd|ls|cat|grep|sed|awk|test|\[|\])\b/)) {
      return 'builtin';
    }
    if (stream.match(/\b\d+\b/)) {
      return 'number';
    }
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '#' },
  },
});

// ── Custom Log file highlighter ─────────────────────────────
const logSeverityDecorations = {
  error: Decoration.mark({ class: 'cm-log-error' }),
  warn: Decoration.mark({ class: 'cm-log-warn' }),
  info: Decoration.mark({ class: 'cm-log-info' }),
  debug: Decoration.mark({ class: 'cm-log-debug' }),
};

const logHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations = Decoration.none;
    constructor(view: import('@codemirror/view').EditorView) {
      this.decorations = this.buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }
    buildDecorations(view: import('@codemirror/view').EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const regex = /\b(ERROR|FATAL|WARN(?:ING)?|INFO|DEBUG)\b/gi;
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text))) {
          const start = from + m.index;
          const end = start + m[0].length;
          const word = m[1].toUpperCase();
          if (word.startsWith('ERR') || word === 'FATAL') {
            builder.add(start, end, logSeverityDecorations.error);
          } else if (word.startsWith('WARN')) {
            builder.add(start, end, logSeverityDecorations.warn);
          } else if (word === 'INFO') {
            builder.add(start, end, logSeverityDecorations.info);
          } else if (word === 'DEBUG') {
            builder.add(start, end, logSeverityDecorations.debug);
          }
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

const logHighlight = (): Extension => logHighlightPlugin;

// ── Cache for dynamically loaded language extensions ────────
const languageCache = new Map<string, Extension[]>();

// Lightweight languages that don't need dynamic import
const LIGHTWEIGHT_LANGUAGES = new Set<Language>(['ini', 'log', 'shell', 'plaintext', 'csharp']);

/**
 * Synchronous language extensions for lightweight/custom languages.
 * Heavy language packs (@codemirror/lang-*) return [] here and must
 * be loaded via `loadLanguageExtensions()`.
 */
export function getLanguageExtensionsSync(lang: Language): Extension[] {
  switch (lang) {
    case 'ini':
      return [iniLanguage];
    case 'log':
      return [logHighlight()];
    case 'shell':
      return [shellLanguage];
    case 'plaintext':
    case 'csharp':
    default:
      return [];
  }
}

/**
 * Asynchronously load language extensions with dynamic import and caching.
 * Heavy @codemirror/lang-* packs are loaded on-demand, reducing initial bundle.
 */
export async function loadLanguageExtensions(lang: Language): Promise<Extension[]> {
  if (languageCache.has(lang)) {
    return languageCache.get(lang)!;
  }

  // Lightweight languages: return immediately
  if (LIGHTWEIGHT_LANGUAGES.has(lang)) {
    const exts = getLanguageExtensionsSync(lang);
    languageCache.set(lang, exts);
    return exts;
  }

  // eslint-disable-next-line no-useless-assignment
  let exts: Extension[] = [];

  switch (lang) {
    case 'javascript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      exts = [javascript({ jsx: true, typescript: false })];
      break;
    }
    case 'typescript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      exts = [javascript({ jsx: true, typescript: true })];
      break;
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html');
      exts = [html()];
      break;
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      exts = [css()];
      break;
    }
    case 'json':
    case 'jsonl': {
      const { json } = await import('@codemirror/lang-json');
      exts = [json()];
      break;
    }
    case 'python': {
      const { python } = await import('@codemirror/lang-python');
      exts = [python()];
      break;
    }
    case 'java': {
      const { java } = await import('@codemirror/lang-java');
      exts = [java()];
      break;
    }
    case 'cpp':
    case 'c': {
      const { cpp } = await import('@codemirror/lang-cpp');
      exts = [cpp()];
      break;
    }
    case 'rust': {
      const { rust } = await import('@codemirror/lang-rust');
      exts = [rust()];
      break;
    }
    case 'go': {
      const { go } = await import('@codemirror/lang-go');
      exts = [go()];
      break;
    }
    case 'markdown': {
      const { markdown } = await import('@codemirror/lang-markdown');
      exts = [markdown()];
      break;
    }
    case 'yaml': {
      const { yaml } = await import('@codemirror/lang-yaml');
      exts = [yaml()];
      break;
    }
    case 'xml': {
      const { xml } = await import('@codemirror/lang-xml');
      exts = [xml()];
      break;
    }
    case 'sql': {
      const { sql } = await import('@codemirror/lang-sql');
      exts = [sql()];
      break;
    }
    default:
      exts = [];
  }

  languageCache.set(lang, exts);
  return exts;
}

/**
 * Preload commonly used language packs in the background.
 * Call this after app init to warm the cache for typical languages.
 */
export function preloadCommonLanguages(): void {
  const common: Language[] = ['javascript', 'typescript', 'html', 'css', 'json', 'markdown'];
  for (const lang of common) {
    loadLanguageExtensions(lang).catch((err) => {
      console.error(`[Language] Failed to preload ${lang}:`, err);
    });
  }
}
