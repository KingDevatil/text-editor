import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, highlightWhitespace, highlightTrailingWhitespace, highlightSpecialChars, scrollPastEnd as scrollPastEndExt, rectangularSelection, crosshairCursor, drawSelection, dropCursor, ViewPlugin, ViewUpdate, Decoration } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection, Prec, type Extension, RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { selectNextOccurrence, selectSelectionMatches, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, foldKeymap, indentOnInput, indentUnit } from '@codemirror/language';
import { unicodeHighlight as unicodeHighlightExt } from './unicodeHighlight';
import { eolMarkers } from './showInvisibles';
import { loadLanguageExtensions, getLanguageExtensionsSync } from './languageExtensions';
import { buildDynamicTheme, syntaxHighlightExtension } from './themes';
import { indentGuides } from './indentGuides';
import { hoverInfo } from './hover';
import { bracketColorization } from './bracketColorization';
import { searchHighlight } from './searchHighlight';
import { signatureHelp } from './signatureHelp';
import { columnAlignExtension, columnAlignTabCommand, columnAlignShiftTabCommand } from './columnAlign';
import { markedLinesField, pairGutter, bracketAndTagMatcher } from './bracketTagMatching';
import { executeMarkdownAction } from './markdownActions';
import type { Language, ThemeColors } from '../types';

/** Factory for per-instance compartments so multiple editors can be reconfigured independently. */
export function createCompartments() {
  return {
    language: new Compartment(),
    theme: new Compartment(),
    fontSize: new Compartment(),
    readOnly: new Compartment(),
    lint: new Compartment(),
    autocomplete: new Compartment(),
    wordWrap: new Compartment(),
    unicodeHighlight: new Compartment(),
    largeFile: new Compartment(),
    columnAlign: new Compartment(),
    tabBehavior: new Compartment(),
    whitespace: new Compartment(),
    lineSeparator: new Compartment(),
    heavyFeatures: new Compartment(),
    markdownKeymap: new Compartment(),
  };
}

export type EditorCompartments = ReturnType<typeof createCompartments>;

// Global cache so compartment objects survive CmEditor unmount/remount per tab.
// This is required because EditorState saved in the pool references the original
// compartment objects; reconfigure() on a newly-created Compartment is a no-op.
const compartmentCache = new Map<string, EditorCompartments>();

export function getOrCreateCompartments(tabId: string): EditorCompartments {
  if (!compartmentCache.has(tabId)) {
    compartmentCache.set(tabId, createCompartments());
  }
  return compartmentCache.get(tabId)!;
}

export function deleteCompartments(tabId: string): void {
  compartmentCache.delete(tabId);
}

// ── Large-file line-level heuristic highlighter ─────────────────

const largeFileLineHighlighter = ViewPlugin.fromClass(
  class {
    decorations = Decoration.none;
    constructor(view: import('@codemirror/view').EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: import('@codemirror/view').EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const patterns: { regex: RegExp; className: string }[] = [
        { regex: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/, className: 'cm-lf-timestamp' },
        { regex: /^\s*"[^"]+"\s*:/, className: 'cm-lf-json-key' },
        { regex: /^\s*'[^']+'\s*:/, className: 'cm-lf-json-key' },
        { regex: /\b(ERROR|FATAL|WARN(?:ING)?|INFO|DEBUG)\b/, className: 'cm-lf-log-level' },
        { regex: /https?:\/\/\S+/, className: 'cm-lf-url' },
        { regex: /^\s*at\s+/, className: 'cm-lf-stack' },
        { regex: /^\s*#/, className: 'cm-lf-comment' },
      ];
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos < to) {
          const line = view.state.doc.lineAt(pos);
          const text = line.text;
          for (const pat of patterns) {
            const m = text.match(pat.regex);
            if (m && m.index !== undefined) {
              const start = line.from + m.index;
              const end = start + m[0].length;
              builder.add(start, end, Decoration.mark({ class: pat.className }));
            }
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

const largeFileLineHighlightTheme = EditorView.theme({
  '.cm-lf-timestamp': { color: '#a78bfa' },
  '.cm-lf-json-key': { color: '#93c5fd', fontWeight: 'bold' },
  '.cm-lf-log-level': { fontWeight: 'bold' },
  '.cm-lf-url': { color: '#60a5fa', textDecoration: 'underline' },
  '.cm-lf-stack': { color: '#f87171' },
  '.cm-lf-comment': { color: '#6b7280', fontStyle: 'normal' },
});

const jsoncCommentMark = Decoration.mark({ class: 'cm-json-comment' });

const jsoncCommentHighlighter = ViewPlugin.fromClass(
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
      let inBlockComment = false;
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos < to) {
          const line = view.state.doc.lineAt(pos);
          const result = scanJsoncCommentSegments(line.text, inBlockComment);
          inBlockComment = result.inBlockComment;
          for (const segment of result.segments) {
            builder.add(line.from + segment.from, line.from + segment.to, jsoncCommentMark);
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

function scanJsoncCommentSegments(text: string, startsInBlockComment: boolean): {
  segments: Array<{ from: number; to: number }>;
  inBlockComment: boolean;
} {
  const segments: Array<{ from: number; to: number }> = [];
  let inBlockComment = startsInBlockComment;
  let blockStart = startsInBlockComment ? 0 : -1;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        segments.push({ from: Math.max(0, blockStart), to: index + 2 });
        inBlockComment = false;
        blockStart = -1;
        index++;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '/' && next === '/') {
      segments.push({ from: index, to: text.length });
      break;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      blockStart = index;
      index++;
    }
  }

  if (inBlockComment && blockStart >= 0) {
    segments.push({ from: blockStart, to: text.length });
  }

  return { segments, inBlockComment };
}

/** Insert a literal tab at the cursor when not in in leading whitespace;
 *  otherwise fall back to indenting the line (indentMore). */
function smartTab(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  // Non-empty selection: indent the whole line(s)
  if (range.from !== range.to) {
    return indentMore(view);
  }
  const pos = range.head;
  const line = state.doc.lineAt(pos);
  const rel = pos - line.from;
  const linePrefix = line.text.slice(0, rel);
  // Cursor is inside leading whitespace: increase indent
  if (/^\s*$/.test(linePrefix)) {
    return indentMore(view);
  }
  // Otherwise insert a literal tab at cursor
  const changes = state.changeByRange((r) => ({
    changes: { from: r.from, to: r.to, insert: '\t' },
    range: EditorSelection.cursor(r.from + 1),
  }));
  view.dispatch(state.update(changes, { userEvent: 'input' }));
  return true;
}

/** Notepad++ style: Ctrl + click adds a cursor (multi-selection). */
const ctrlClickMultiCursor = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null) {
        const ranges = view.state.selection.ranges.slice();
        ranges.push(EditorSelection.cursor(pos));
        view.dispatch({ selection: EditorSelection.create(ranges) });
      }
      event.preventDefault();
      return true;
    }
    return false;
  },
});

export function buildBaseExtensions(
  compartments: EditorCompartments,
  lang: Language,
  colors: ThemeColors,
  fontSize: number,
  readOnly: boolean,
  largeFileOptimize: boolean,
  wordWrap: boolean,
  showWhitespace: boolean,
  enableScrollPastEnd: boolean,
  _tabId: string,
  enableUnicodeHighlight: boolean,
  isDark: boolean,
): Extension[] {
  const exts: Extension[] = [
    history(),
    drawSelection(),
    highlightSpecialChars({ specialChars: /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g }),
    dropCursor(),
    closeBrackets(),
    indentOnInput(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    ctrlClickMultiCursor,
    indentUnit.of('\t'),
    keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
    keymap.of([
      { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
      { key: 'Shift-Mod-l', run: selectSelectionMatches, preventDefault: true },
    ]),
    compartments.tabBehavior.of(
      Prec.highest(
        keymap.of([
          {
            key: 'Tab',
            run: (view) => columnAlignTabCommand(view) || smartTab(view),
            shift: (view) => columnAlignShiftTabCommand(view) || indentLess(view),
          },
        ])
      )
    ),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    syntaxHighlightExtension,
    ...(lang === 'json' || lang === 'jsonl' ? [jsoncCommentHighlighter] : []),
    compartments.language.of(getLanguageExtensionsSync(lang)),
    compartments.theme.of(buildDynamicTheme(colors, isDark)),
    compartments.fontSize.of(
      EditorView.theme({
        '.cm-content': { fontSize: `${fontSize}px` },
        '.cm-gutters': { fontSize: `${fontSize}px` },
      })
    ),
    compartments.readOnly.of(EditorView.editable.of(!readOnly)),
    compartments.wordWrap.of(wordWrap ? EditorView.lineWrapping : []),
    compartments.unicodeHighlight.of(enableUnicodeHighlight ? [...unicodeHighlightExt] : []),
    compartments.markdownKeymap.of(lang === 'markdown' ? createMarkdownKeymap() : []),
  ];

  // Heavy features: disabled in large-file mode to reduce CPU / memory
  const heavyExts: Extension[] = largeFileOptimize
    ? []
    : [
        markedLinesField,
        pairGutter,
        bracketAndTagMatcher,
        highlightSelectionMatches(),
        ...indentGuides,
        hoverInfo,
        bracketColorization,
        signatureHelp(),
        columnAlignExtension,
      ];

  exts.push(compartments.heavyFeatures.of(heavyExts));

  // Search highlight is always enabled (not part of heavyExts) so it survives
  // large-file mode and is always available for FindReplace.
  exts.push(...searchHighlight);

  exts.push(
    compartments.largeFile.of(
      largeFileOptimize
        ? [largeFileLineHighlighter, largeFileLineHighlightTheme]
        : [foldGutter({ openText: '▼', closedText: '▶' }), keymap.of(foldKeymap)]
    )
  );

  exts.push(
    compartments.whitespace.of(
      showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace(), eolMarkers] : []
    )
  );
  if (enableScrollPastEnd) {
    exts.push(scrollPastEndExt());
  }

  return exts;
}

/**
 * Markdown keyboard shortcuts (override defaultCodeMirror key bindings).
 */
export function createMarkdownKeymap(): Extension {
  return Prec.highest(
    keymap.of([
      // Heading levels: Ctrl+1 ~ Ctrl+6
      { key: 'Mod-1', run: (view) => { executeMarkdownAction(view, 'h1'); return true; } },
      { key: 'Mod-2', run: (view) => { executeMarkdownAction(view, 'h2'); return true; } },
      { key: 'Mod-3', run: (view) => { executeMarkdownAction(view, 'h3'); return true; } },
      { key: 'Mod-4', run: (view) => { executeMarkdownAction(view, 'h4'); return true; } },
      { key: 'Mod-5', run: (view) => { executeMarkdownAction(view, 'h5'); return true; } },
      { key: 'Mod-6', run: (view) => { executeMarkdownAction(view, 'h6'); return true; } },
      // Inline formatting
      { key: 'Mod-b', run: (view) => { executeMarkdownAction(view, 'bold'); return true; } },
      { key: 'Mod-i', run: (view) => { executeMarkdownAction(view, 'italic'); return true; } },
      { key: 'Mod-u', run: (view) => { executeMarkdownAction(view, 'strikethrough'); return true; } },
      { key: 'Mod-k', run: (view) => { executeMarkdownAction(view, 'link'); return true; } },
      { key: 'Mod-`', run: (view) => { executeMarkdownAction(view, 'inlineCode'); return true; } },
    ]),
  );
}

export { loadLanguageExtensions, largeFileLineHighlighter, largeFileLineHighlightTheme, jsoncCommentHighlighter };
