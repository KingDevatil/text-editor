import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, highlightWhitespace, highlightTrailingWhitespace, scrollPastEnd as scrollPastEndExt, rectangularSelection, crosshairCursor, drawSelection, highlightSpecialChars, dropCursor } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection, Prec, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { selectNextOccurrence, selectSelectionMatches, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, foldKeymap, indentOnInput, indentUnit } from '@codemirror/language';
import { unicodeHighlight as unicodeHighlightExt } from './unicodeHighlight';
import { eolMarkers } from './showInvisibles';
import { loadLanguageExtensions, getLanguageExtensionsSync } from './languageExtensions';
import { buildDynamicTheme, syntaxHighlightExtension } from './themes';
import { getLinterExtension } from './lint';
import { getAutocompleteExtension } from './autocomplete';
import { indentGuides } from './indentGuides';
import { hoverInfo } from './hover';
import { bracketColorization } from './bracketColorization';
import { searchHighlight } from './searchHighlight';
import { signatureHelp } from './signatureHelp';
import { columnAlignExtension, columnAlignTabCommand, columnAlignShiftTabCommand } from './columnAlign';
import { markedLinesField, pairGutter, bracketAndTagMatcher } from './bracketTagMatching';
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
  };
}

export type EditorCompartments = ReturnType<typeof createCompartments>;

/** Insert a literal tab at the cursor when not in leading whitespace;
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
  tabId: string,
  enableUnicodeHighlight: boolean,
  isDark: boolean,
): Extension[] {
  const exts: Extension[] = [
    history(),
    drawSelection(),
    highlightSpecialChars(),
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
    markedLinesField,
    pairGutter,
    bracketAndTagMatcher,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    syntaxHighlightExtension,
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
  ];

  exts.push(
    compartments.largeFile.of(
      largeFileOptimize ? [] : [foldGutter({ openText: '▼', closedText: '▶' }), keymap.of(foldKeymap)]
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

  exts.push(compartments.lint.of(getLinterExtension(lang) || []));
  exts.push(compartments.autocomplete.of(getAutocompleteExtension(lang, tabId) || []));
  exts.push(...indentGuides);
  exts.push(hoverInfo);
  exts.push(bracketColorization);
  exts.push(signatureHelp());
  exts.push(...searchHighlight);
  exts.push(compartments.columnAlign.of(columnAlignExtension));

  return exts;
}

export { loadLanguageExtensions };
