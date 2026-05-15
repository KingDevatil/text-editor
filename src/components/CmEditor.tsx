import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Undo, Redo, Scissors, Copy, ClipboardPaste, AlignLeft, Braces, Map, WrapText, Space, GitCompare, X, FileMinus, Crosshair, FolderOpen } from 'lucide-react';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, highlightWhitespace, highlightTrailingWhitespace, scrollPastEnd as scrollPastEndExt, rectangularSelection, crosshairCursor, drawSelection, highlightSpecialChars, dropCursor, GutterMarker, gutter, Decoration, ViewPlugin } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection, type Extension, StateField, RangeSetBuilder, RangeSet } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, undo, redo, selectAll, indentMore, indentLess } from '@codemirror/commands';
import { selectNextOccurrence, selectSelectionMatches } from '@codemirror/search';
import { highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { foldGutter, foldKeymap, indentOnInput, indentService, IndentContext, indentUnit, matchBrackets, syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { unicodeHighlight as unicodeHighlightExt } from '../utils/unicodeHighlight';
import { loadLanguageExtensions, getLanguageExtensionsSync } from '../utils/languageExtensions';
import { buildDynamicTheme, syntaxHighlightExtension } from '../utils/themes';
import { resolveThemeColors } from '../utils/themeResolver';
import type { ThemeMode } from '../types';
import { formatDocument } from '../utils/cmCommands';
import { getLinterExtension } from '../utils/lint';
import { getAutocompleteExtension } from '../utils/autocomplete';
import { indentGuides } from '../utils/indentGuides';
import { hoverInfo } from '../utils/hover';
import { bracketColorization } from '../utils/bracketColorization';
import { searchHighlight } from '../utils/searchHighlight';
import { signatureHelp } from '../utils/signatureHelp';
import { perf } from '../utils/perf';
import { isTauri } from '@tauri-apps/api/core';
import { columnAlignExtension, setColumnAlign, createColumnDragLayer, columnAlignTabCommand, columnAlignField } from '../utils/columnAlign';
import type { Language, ThemeColors } from '../types';
import {
  getEditorState,
  setEditorState,
  setActiveView,
  getEditorScrollTop,
  setEditorScrollTop,
} from '../hooks/useEditorStatePool';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import Minimap from './Minimap';
import { useEditorStore } from '../hooks/useEditorStore';
import { goToDefinition } from '../utils/cmCommands';
import { executeMarkdownAction } from '../utils/markdownActions';
import MarkdownToolbar from './MarkdownToolbar';

interface CmEditorProps {
  tabId: string;
  language: Language;
  theme: ThemeMode;
  fontSize: number;
  readOnly?: boolean;
  initialContent?: string;
  largeFileOptimize?: boolean;
  wordWrap?: boolean;
  showWhitespace?: boolean;
  scrollPastEnd?: boolean;
  minimapVisible?: boolean;
  unicodeHighlight?: boolean;
  columnAlignEnabled?: boolean;
  onHasTabsChange?: (hasTabs: boolean) => void;
}

// Compartments allow dynamic reconfiguration without recreating the state.
const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const fontSizeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const lintCompartment = new Compartment();
const autocompleteCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const unicodeHighlightCompartment = new Compartment();
const largeFileCompartment = new Compartment();
const columnAlignCompartment = new Compartment();

const FORMATTABLE_LANGUAGES = new Set(['json', 'xml', 'html', 'css', 'javascript', 'typescript', 'sql']);

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

/** Write text to clipboard — uses Tauri plugin in desktop, falls back to navigator API in browser. */
async function writeClipboard(text: string): Promise<void> {
  if (isTauri()) {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
    } catch {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  } else {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

/** Read text from clipboard — uses Tauri plugin in desktop, falls back to navigator API in browser. */
async function readClipboard(): Promise<string> {
  if (isTauri()) {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      return await readText();
    } catch {
      return navigator.clipboard.readText();
    }
  } else {
    return navigator.clipboard.readText();
  }
}

function findTagPair(
  state: EditorState,
  pos: number
): { start: { from: number; to: number }; end: { from: number; to: number } } | null {
  const tree = syntaxTree(state);
  if (!tree) return null;

  let node = tree.resolveInner(pos, 1);

  // Walk up to find OpenTag, CloseTag, TagName, or Element
  let tagContainer: SyntaxNode | null = null;
  for (let cur: SyntaxNode | null = node; cur; cur = cur.parent) {
    const name = cur.type.name;
    if (name === 'TagName') {
      tagContainer = cur.parent;
      break;
    }
    if (name === 'OpenTag' || name === 'CloseTag') {
      tagContainer = cur;
      break;
    }
  }

  // If cursor is inside Element content but not on a tag, find the parent Element
  if (!tagContainer) {
    for (let cur: SyntaxNode | null = node; cur; cur = cur.parent) {
      if (cur.type.name === 'Element') {
        tagContainer = cur;
        break;
      }
    }
  }

  if (!tagContainer) return null;

  // Extract the TagName child range from a tag container
  const getTagName = (container: SyntaxNode): { from: number; to: number } | null => {
    const child = container.getChild('TagName');
    if (child) return { from: child.from, to: child.to };
    const c = container.cursor();
    if (c.firstChild()) {
      do {
        if (c.type.name === 'TagName') return { from: c.from, to: c.to };
      } while (c.nextSibling());
    }
    return null;
  };

  // If tagContainer is Element, search recursively for the nearest tag
  // near the cursor (e.g. cursor is in indentation whitespace before a child tag).
  if (tagContainer.type.name === 'Element') {
    const line = state.doc.lineAt(pos);
    let nearestTag: SyntaxNode | null = null;
    let nearestDist = Infinity;

    const stack: SyntaxNode[] = [tagContainer];
    while (stack.length) {
      const current = stack.pop()!;
      if (nearestDist === 0) break; // can't get better

      if (current.type.name === 'OpenTag' || current.type.name === 'CloseTag') {
        const tagLine = state.doc.lineAt(current.from);
        if (tagLine.number === line.number) {
          const dist = Math.min(Math.abs(current.from - pos), Math.abs(current.to - pos));
          if (dist < nearestDist && dist <= 200) {
            nearestDist = dist;
            nearestTag = current;
          }
        }
      }

      const c = current.cursor();
      if (c.firstChild()) {
        do {
          stack.push(c.node);
        } while (c.nextSibling());
      }
    }

    if (nearestTag) {
      tagContainer = nearestTag;
    } else {
      // Cursor is inside an Element but not near any child tag
      // (e.g. inside <style> or <script> content). Let bracket matching handle it.
      return null;
    }
  }

  const currentTagName = getTagName(tagContainer);
  if (!currentTagName) return null;

  const element = tagContainer.parent;
  if (!element || element.type.name !== 'Element') return null;

  const isOpen = tagContainer.type.name === 'OpenTag';
  let matchTagName: { from: number; to: number } | null = null;

  if (isOpen) {
    const c = element.cursor();
    if (c.firstChild()) {
      let foundSelf = false;
      do {
        if (c.from === tagContainer.from && c.to === tagContainer.to) {
          foundSelf = true;
          continue;
        }
        if (foundSelf && c.type.name === 'CloseTag') {
          matchTagName = getTagName(c.node);
          break;
        }
      } while (c.nextSibling());
    }
  } else {
    const c = element.cursor();
    if (c.lastChild()) {
      let foundSelf = false;
      do {
        if (c.from === tagContainer.from && c.to === tagContainer.to) {
          foundSelf = true;
          continue;
        }
        if (foundSelf && c.type.name === 'OpenTag') {
          matchTagName = getTagName(c.node);
          break;
        }
      } while (c.prevSibling());
    }
  }

  if (!matchTagName) return null;
  return { start: currentTagName, end: matchTagName };
}

/** Search near pos (skipping whitespace) for the closest bracket on the same line. */
function findBracketNear(
  state: EditorState,
  pos: number
): { pos: number; dir: -1 | 1 } | null {
  const openBrackets = '([{<';
  const closeBrackets = ')]}>';
  const line = state.doc.lineAt(pos);

  // Search backward (stay on the same line)
  for (let p = pos - 1; p >= line.from; p--) {
    const ch = state.doc.sliceString(p, p + 1);
    if (openBrackets.includes(ch)) return { pos: p, dir: 1 };
    if (closeBrackets.includes(ch)) return { pos: p + 1, dir: -1 };
    if (ch !== ' ' && ch !== '\t') break;
  }

  // Search forward (stay on the same line)
  for (let p = pos; p < line.to && p < state.doc.length; p++) {
    const ch = state.doc.sliceString(p, p + 1);
    if (openBrackets.includes(ch)) return { pos: p, dir: 1 };
    if (closeBrackets.includes(ch)) return { pos: p + 1, dir: -1 };
    if (ch !== ' ' && ch !== '\t') break;
  }

  return null;
}

function computeMarkedLines(state: EditorState, cursorPos: number): readonly number[] {
  const lines = new Set<number>();

  // Try syntax-tree tag matching first (HTML/XML)
  const tagMatch = findTagPair(state, cursorPos);
  if (tagMatch) {
    lines.add(state.doc.lineAt(tagMatch.start.from).number);
    lines.add(state.doc.lineAt(tagMatch.end.from).number);
    return Object.freeze([...lines].sort((a, b) => a - b));
  }

  // Fall back to plain bracket matching
  const config = { brackets: '()[]{}<>' as string };
  let match = null;

  const bracketNear = findBracketNear(state, cursorPos);
  if (bracketNear) {
    match = matchBrackets(state, bracketNear.pos, bracketNear.dir, config);
  }

  if (match && match.matched && match.end) {
    lines.add(state.doc.lineAt(match.start.from).number);
    lines.add(state.doc.lineAt(match.end.from).number);
  }

  return Object.freeze([...lines].sort((a, b) => a - b));
}

class PairMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-bracket-marker';
    span.textContent = '◆';
    return span;
  }
}

const pairMarkerInstance = new PairMarker();

/** StateField that stores a RangeSet of gutter markers for bracket/tag pair matches. */
const markedLinesField = StateField.define<RangeSet<any>>({
  create(state) {
    const cursorPos = state.selection.main.head;
    const lines = computeMarkedLines(state, cursorPos);
    const builder = new RangeSetBuilder<any>();
    for (const lineNo of lines) {
      const line = state.doc.line(lineNo);
      builder.add(line.from, line.to, pairMarkerInstance);
    }
    return builder.finish();
  },
  update(value, tr) {
    if (!tr.docChanged && tr.startState.selection.eq(tr.state.selection)) return value;
    const cursorPos = tr.state.selection.main.head;
    const lines = computeMarkedLines(tr.state, cursorPos);
    const builder = new RangeSetBuilder<any>();
    for (const lineNo of lines) {
      const line = tr.state.doc.line(lineNo);
      builder.add(line.from, line.to, pairMarkerInstance);
    }
    return builder.finish();
  },
});

/** Gutter that shows ◆ on lines containing a bracket/tag pair match. */
const pairGutter = gutter({
  class: 'cm-pair-gutter',
  markers(view) {
    return view.state.field(markedLinesField);
  },
  initialSpacer() {
    return pairMarkerInstance;
  },
});

const pairMatchMark = Decoration.mark({ class: 'cm-matchingBracket' });

/** ViewPlugin that highlights tag names for HTML/XML, and brackets for plain text. */
const bracketAndTagMatcher = ViewPlugin.fromClass(
  class {
    decorations: any;
    constructor(view: EditorView) {
      this.decorations = this.compute(view);
    }
    update(update: any) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = this.compute(update.view);
      }
    }
    compute(view: EditorView) {
      const decorations: any[] = [];
      for (const range of view.state.selection.ranges) {
        if (!range.empty) continue;

        // Try tag name pair first (HTML/XML)
        const tagMatch = findTagPair(view.state, range.head);
        if (tagMatch) {
          decorations.push(pairMatchMark.range(tagMatch.start.from, tagMatch.start.to));
          decorations.push(pairMatchMark.range(tagMatch.end.from, tagMatch.end.to));
          continue;
        }

        // Fall back to plain bracket matching
        const config = { brackets: '()[]{}<>' as string };
        let match = null;

        const bracketNear = findBracketNear(view.state, range.head);
        if (bracketNear) {
          match = matchBrackets(view.state, bracketNear.pos, bracketNear.dir, config);
        }

        if (match && match.end) {
          decorations.push(pairMatchMark.range(match.start.from, match.start.to));
          decorations.push(pairMatchMark.range(match.end.from, match.end.to));
        }
      }
      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v: any) => v.decorations }
);

function buildBaseExtensions(
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
    indentService.of((context: IndentContext, pos: number) => {
      const line = context.state.doc.lineAt(pos);
      const prevLine = context.state.doc.line(Math.max(1, line.number - 1));
      const indent = prevLine.text.match(/^\s*/)?.[0] || '';
      if (!indent) return null;
      return context.column(prevLine.from + indent.length);
    }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
    keymap.of([
      { key: 'Tab', run: columnAlignTabCommand },
      { key: 'Tab', run: indentMore, shift: indentLess },
      { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
      { key: 'Shift-Mod-l', run: selectSelectionMatches, preventDefault: true },
    ]),
    markedLinesField,
    pairGutter,
    bracketAndTagMatcher,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    syntaxHighlightExtension,
    languageCompartment.of(getLanguageExtensionsSync(lang)),
    themeCompartment.of(buildDynamicTheme(colors, isDark)),
    fontSizeCompartment.of(
      EditorView.theme({
        '.cm-content': { fontSize: `${fontSize}px` },
        '.cm-gutters': { fontSize: `${fontSize}px` },
      })
    ),
    readOnlyCompartment.of(EditorView.editable.of(!readOnly)),
    wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
    unicodeHighlightCompartment.of(enableUnicodeHighlight ? [...unicodeHighlightExt] : []),
  ];

  exts.push(
    largeFileCompartment.of(
      largeFileOptimize ? [] : [foldGutter({ openText: '▼', closedText: '▶' }), keymap.of(foldKeymap)]
    )
  );

  if (showWhitespace) {
    exts.push(highlightWhitespace(), highlightTrailingWhitespace());
  }
  if (enableScrollPastEnd) {
    exts.push(scrollPastEndExt());
  }

  exts.push(lintCompartment.of(getLinterExtension(lang) || []));
  exts.push(autocompleteCompartment.of(getAutocompleteExtension(lang, tabId) || []));
  exts.push(...indentGuides);
  exts.push(hoverInfo);
  exts.push(bracketColorization);
  exts.push(signatureHelp());
  exts.push(...searchHighlight);
  exts.push(columnAlignCompartment.of([columnAlignField]));

  return exts;
}

const CmEditor: React.FC<CmEditorProps> = ({
  tabId,
  language,
  theme,
  fontSize,
  readOnly = false,
  initialContent = '',
  largeFileOptimize = false,
  wordWrap = false,
  showWhitespace = false,
  scrollPastEnd: enableScrollPastEnd = true,
  minimapVisible = true,
  unicodeHighlight: enableUnicodeHighlight = false,
  columnAlignEnabled = false,
  onHasTabsChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const canFormat = FORMATTABLE_LANGUAGES.has(language);

  // Subscribe to custom colors from store for dynamic theme resolution
  const lightCustomColors = useEditorStore((s) => s.lightCustomColors);
  const darkCustomColors = useEditorStore((s) => s.darkCustomColors);
  const customColors = useEditorStore((s) => s.customColors);

  // Initialize or switch editor state when tabId changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let view = viewRef.current;
    let cancelled = false;

    // Save previous tab's state before switching
    if (view) {
      setEditorState(tabId, view.state);
      view.destroy();
      viewRef.current = null;
    }

    // Get or create state for this tab
    let state = getEditorState(tabId);
    if (!state) {
      perf.mark(`editor-init-start-${tabId}`);
      state = EditorState.create({
        doc: initialContent,
        extensions: [
          ...buildBaseExtensions(language, resolveThemeColors(theme, lightCustomColors, darkCustomColors, customColors), fontSize, readOnly, largeFileOptimize, wordWrap, showWhitespace, enableScrollPastEnd, tabId, enableUnicodeHighlight, theme !== 'light'),
          EditorView.updateListener.of((update) => {
            // Always save state to pool so that effects (language/theme changes)
            // are persisted, not just doc changes.
            setEditorState(tabId, update.state);
            if (update.docChanged) {
              useEditorStore.getState().markTabDirty(tabId, true);
              // Notify parent whether document contains tabs
              const hasTabs = update.state.doc.toString().includes('\t');
              onHasTabsChange?.(hasTabs);
            }
          }),
        ],
      });
      setEditorState(tabId, state);
      perf.mark(`editor-init-end-${tabId}`);
      perf.measure('editor-init', `editor-init-start-${tabId}`, `editor-init-end-${tabId}`, {
        tabId,
        language,
        docLength: initialContent.length,
      });
    }

    // Create new view
    view = new EditorView({
      state,
      parent: container,
    });
    viewRef.current = view;
    setActiveView(tabId, view);

    // Notify parent whether initial document contains tabs
    // (docChanged listener only fires on edits, not on initial load)
    const initialHasTabs = view.state.doc.toString().includes('\t');
    onHasTabsChange?.(initialHasTabs);

    // Restore previous scroll position for this tab
    const savedScrollTop = getEditorScrollTop(tabId);
    if (savedScrollTop !== undefined && savedScrollTop > 0) {
      const restoreScroll = () => {
        if (viewRef.current) {
          viewRef.current.scrollDOM.scrollTop = savedScrollTop;
        }
      };
      requestAnimationFrame(restoreScroll);
      setTimeout(restoreScroll, 50);
    }

    // Ensure wordWrap is applied even when reusing a pooled state with stale config
    view.dispatch({
      effects: wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });

    // Apply fontSize via CSS variable for instant visual feedback
    view.dom.style.setProperty('--cm-font-size', `${fontSize}px`);

    // Workaround: if CM6 default double-click word selection fails to show
    // visual highlight (but selection is logically set), force a re-draw.
    let dblClickCleanup: (() => void) | undefined;
    const cmContent = view.dom.querySelector('.cm-content') as HTMLElement | null;
    if (cmContent) {
      const handleDblClick = (e: MouseEvent) => {
        const v = viewRef.current;
        if (!v) return;
        const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) return;
        const word = v.state.wordAt(pos);
        if (word && word.from !== word.to) {
          // Only dispatch if the current selection doesn't already match the word.
          // This avoids conflicting with CM6's built-in dblclick handler.
          const sel = v.state.selection.main;
          if (sel.from !== word.from || sel.to !== word.to) {
            v.dispatch({ selection: { anchor: word.from, head: word.to } });
          }
          // Do NOT stopPropagation — let CM6 handle the rest (highlighting, etc.)
        }
      };
      cmContent.addEventListener('dblclick', handleDblClick);
      dblClickCleanup = () => cmContent.removeEventListener('dblclick', handleDblClick);
    }

    // Async load heavy language pack and apply when ready
    loadLanguageExtensions(language).then((exts) => {
      if (cancelled || !viewRef.current) return;
      viewRef.current.dispatch({
        effects: languageCompartment.reconfigure(exts),
      });
    }).catch((err) => {
      console.error(`[CmEditor] Failed to load language ${language}:`, err);
    });

    return () => {
      cancelled = true;
      dblClickCleanup?.();
      if (view) {
        setEditorScrollTop(tabId, view.scrollDOM.scrollTop);
        setEditorState(tabId, view.state);
        setActiveView(tabId, null);
        view.destroy();
        viewRef.current = null;
      }
    };
  // Only re-run when tabId changes (or largeFileOptimize which affects base extensions).
  // Language/theme/fontSize/readOnly changes are handled by their own effects below.
  }, [tabId, largeFileOptimize]);

  // Dynamic reconfiguration: language (async load heavy packs)
  const langNonceRef = useRef(0);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const nonce = ++langNonceRef.current;
    console.log('[CmEditor] language change:', language, 'tabId:', tabId);

    // Apply lightweight extension immediately (clears old highlighting for heavy langs)
    view.dispatch({
      effects: [
        languageCompartment.reconfigure(getLanguageExtensionsSync(language)),
        lintCompartment.reconfigure(getLinterExtension(language) || []),
        autocompleteCompartment.reconfigure(getAutocompleteExtension(language, tabId) || []),
      ],
    });
    setEditorState(tabId, view.state);

    // Then load heavy pack in background
    loadLanguageExtensions(language).then((exts) => {
      // Ignore stale responses from rapid language switches
      if (nonce !== langNonceRef.current) {
        console.log('[CmEditor] language change stale, ignoring', language);
        return;
      }
      if (viewRef.current) {
        viewRef.current.dispatch({
          effects: languageCompartment.reconfigure(exts),
        });
        setEditorState(tabId, viewRef.current.state);
      }
    }).catch((err) => {
      console.error(`[CmEditor] Failed to load language ${language}:`, err);
    });
  }, [language, tabId]);

  // Dynamic reconfiguration: theme
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const colors = resolveThemeColors(theme, lightCustomColors, darkCustomColors, customColors);
    view.dispatch({
      effects: themeCompartment.reconfigure(buildDynamicTheme(colors, theme !== 'light')),
    });
    setEditorState(tabId, view.state);
  }, [theme, lightCustomColors, darkCustomColors, customColors, tabId]);

  // Dynamic reconfiguration: font size
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Apply via CSS variable for instant visual feedback (highest priority)
    view.dom.style.setProperty('--cm-font-size', `${fontSize}px`);
    // Also update compartment so the state stays consistent
    view.dispatch({
      effects: fontSizeCompartment.reconfigure(
        EditorView.theme({
          '.cm-content': { fontSize: `${fontSize}px` },
          '.cm-gutters': { fontSize: `${fontSize}px` },
        })
      ),
    });
    setEditorState(tabId, view.state);
  }, [fontSize, tabId]);

  // Dynamic reconfiguration: read-only
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readOnly)),
    });
    setEditorState(tabId, view.state);
  }, [readOnly, tabId]);

  // Dynamic reconfiguration: word wrap
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
    setEditorState(tabId, view.state);
  }, [wordWrap, tabId]);

  // Dynamic reconfiguration: unicode highlight
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: unicodeHighlightCompartment.reconfigure(enableUnicodeHighlight ? [...unicodeHighlightExt] : []),
    });
    setEditorState(tabId, view.state);
  }, [enableUnicodeHighlight, tabId]);

  // Dynamic reconfiguration: large file optimize (foldGutter + bracketMatching)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: largeFileCompartment.reconfigure(
        largeFileOptimize ? [] : [foldGutter({ openText: '▼', closedText: '▶' }), keymap.of(foldKeymap)]
      ),
    });
    setEditorState(tabId, view.state);
  }, [largeFileOptimize, tabId]);

  // Notify parent when this editor becomes the active tab
  // (onHasTabsChange switches from undefined to the setter)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !onHasTabsChange) return;
    const hasTabs = view.state.doc.toString().includes('\t');
    onHasTabsChange(hasTabs);
  }, [onHasTabsChange]);

  // Dynamic reconfiguration: column align
  const dragLayerCleanupRef = useRef<(() => void) | null>(null);
  const tabColumnWidthsRef = useRef<Record<string, number[]>>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem('te2-column-widths') || '{}');
      } catch {
        return {};
      }
    })()
  );

  // Effect 1: Reconfigure compartment and restore per-tab widths
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: columnAlignCompartment.reconfigure(
        columnAlignEnabled ? columnAlignExtension : []
      ),
    });
    if (columnAlignEnabled) {
      const savedWidths = tabColumnWidthsRef.current[tabId] || [];
      view.dispatch({
        effects: setColumnAlign.of({ enabled: true, widths: savedWidths }),
      });
    }
    setEditorState(tabId, view.state);
  }, [columnAlignEnabled, tabId]);

  // Effect 2: Manage drag layer lifecycle
  useEffect(() => {
    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container) return;

    if (columnAlignEnabled) {
      dragLayerCleanupRef.current = createColumnDragLayer(container, view, (widths) => {
        tabColumnWidthsRef.current[tabId] = widths;
        try {
          localStorage.setItem('te2-column-widths', JSON.stringify(tabColumnWidthsRef.current));
        } catch {
          // ignore
        }
        view.dispatch({
          effects: setColumnAlign.of({ enabled: true, widths }),
        });
      });
    } else {
      dragLayerCleanupRef.current?.();
      dragLayerCleanupRef.current = null;
    }

    return () => {
      dragLayerCleanupRef.current?.();
      dragLayerCleanupRef.current = null;
    };
  }, [columnAlignEnabled, tabId]);

  // Build context menu items based on current editor state
  const buildMenuItems = useCallback((): ContextMenuItem[] => {
    const view = viewRef.current;
    if (!view) return [];

    const { state } = view;
    const hasSelection = state.selection.main.from !== state.selection.main.to;
    const canUndo = undo({ state, dispatch: () => {} });
    const canRedo = redo({ state, dispatch: () => {} });

    // Access global store for tab management and toggles
    const store = useEditorStore.getState();
    const allTabs = store.tabs;
    const otherTabs = allTabs.filter((t) => t.id !== tabId);
    const isDiffMode = store.diffMode;

    const items: ContextMenuItem[] = [
      {
        id: 'undo',
        label: '撤销',
        icon: <Undo size={14} />,
        shortcut: 'Ctrl+Z',
        disabled: !canUndo,
        action: () => undo(view),
      },
      {
        id: 'redo',
        label: '恢复',
        icon: <Redo size={14} />,
        shortcut: 'Ctrl+Y',
        disabled: !canRedo,
        action: () => redo(view),
      },
      { id: 'divider-1', label: '', icon: null, divider: true, action: () => {} },
      {
        id: 'cut',
        label: '剪切',
        icon: <Scissors size={14} />,
        shortcut: 'Ctrl+X',
        disabled: !hasSelection,
        action: () => {
          const text = state.doc.sliceString(state.selection.main.from, state.selection.main.to);
          writeClipboard(text);
          view.dispatch({
            changes: { from: state.selection.main.from, to: state.selection.main.to, insert: '' },
          });
        },
      },
      {
        id: 'copy',
        label: '复制',
        icon: <Copy size={14} />,
        shortcut: 'Ctrl+C',
        disabled: !hasSelection,
        action: () => {
          const text = state.doc.sliceString(state.selection.main.from, state.selection.main.to);
          writeClipboard(text);
        },
      },
      {
        id: 'paste',
        label: '粘贴',
        icon: <ClipboardPaste size={14} />,
        shortcut: 'Ctrl+V',
        action: () => {
          readClipboard().then((text) => {
            view.dispatch({
              changes: { from: state.selection.main.from, to: state.selection.main.to, insert: text },
              selection: { anchor: state.selection.main.from + text.length },
            });
          }).catch(() => {});
        },
      },
      {
        id: 'select-all',
        label: '全选',
        icon: <AlignLeft size={14} />,
        shortcut: 'Ctrl+A',
        action: () => selectAll(view),
      },
      { id: 'divider-2', label: '', icon: null, divider: true, action: () => {} },
      {
        id: 'goto-def',
        label: '转到定义',
        icon: <Crosshair size={14} />,
        shortcut: 'F12',
        action: () => {
          const ok = goToDefinition(view);
          if (!ok) console.warn('[GoToDef] 无法找到定义（当前仅支持同文件内跳转）');
        },
      },
      { id: 'divider-3', label: '', icon: null, divider: true, action: () => {} },
      {
        id: 'format',
        label: hasSelection ? '格式化选区' : '格式化本行',
        icon: <Braces size={14} />,
        shortcut: 'Shift+Alt+F',
        action: () => {
          const ok = formatDocument(view, language, 'selection');
          if (!ok) console.warn('[Format] 格式化失败：请确保选区内容是有效的可格式化文本');
        },
      },
    ];

    // Tab management section
    if (otherTabs.length > 0) {
      items.push(
        { id: 'divider-tab', label: '', icon: null, divider: true, action: () => {} },
        {
          id: 'close-tab',
          label: '关闭标签页',
          icon: <X size={14} />,
          action: () => store.closeTab(tabId),
        }
      );
      if (otherTabs.length > 1) {
        items.push({
          id: 'close-other-tabs',
          label: '关闭其他标签页',
          icon: <FileMinus size={14} />,
          action: () => store.closeTabs(otherTabs.map((t) => t.id)),
        });
      }
      // Diff option
      if (!isDiffMode && otherTabs.length >= 1) {
        items.push({
          id: 'diff-with',
          label: `与 "${otherTabs[0].title}" 对比`,
          icon: <GitCompare size={14} />,
          action: () => {
            store.setDiffPair(tabId, otherTabs[0].id);
            store.setDiffMode(true);
          },
        });
      }
    }

    // Reveal in folder
    const currentTab = store.tabs.find((t) => t.id === tabId);
    if (currentTab?.filePath) {
      items.push(
        { id: 'divider-reveal', label: '', icon: null, divider: true, action: () => {} },
        {
          id: 'reveal-in-folder',
          label: '在文件夹中显示',
          icon: <FolderOpen size={14} />,
          action: async () => {
            if (currentTab.filePath) {
              try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('reveal_in_folder', { path: currentTab.filePath });
              } catch (err) {
                console.error('[Reveal] 打开文件夹失败:', err);
              }
            }
          },
        }
      );
    }

    // Exit diff mode
    if (isDiffMode) {
      items.push(
        { id: 'divider-diff', label: '', icon: null, divider: true, action: () => {} },
        {
          id: 'exit-diff',
          label: '退出对比',
          icon: <GitCompare size={14} />,
          action: () => {
            store.setDiffMode(false);
            store.setDiffPair(null, null);
          },
        }
      );
    }

    // View toggles
    items.push(
      { id: 'divider-view', label: '', icon: null, divider: true, action: () => {} },
      {
        id: 'toggle-minimap',
        label: store.minimapVisible ? '隐藏缩略图' : '显示缩略图',
        icon: <Map size={14} />,
        action: () => store.setMinimapVisible(!store.minimapVisible),
      },
      {
        id: 'toggle-wordwrap',
        label: store.wordWrap ? '关闭自动换行' : '开启自动换行',
        icon: <WrapText size={14} />,
        action: () => store.setWordWrap(!store.wordWrap),
      },
      {
        id: 'toggle-whitespace',
        label: store.showWhitespace ? '隐藏空白字符' : '显示空白字符',
        icon: <Space size={14} />,
        action: () => store.setShowWhitespace(!store.showWhitespace),
      }
    );

    return items;
  }, [language, canFormat, tabId]);

  // Context menu handler — compute items at click time to ensure viewRef is ready
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, items: buildMenuItems() });
  }, [buildMenuItems]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('contextmenu', handleContextMenu);
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleContextMenu]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {language === 'markdown' && !readOnly && (
        <MarkdownToolbar
          onAction={(action) => {
            const view = viewRef.current;
            if (view) executeMarkdownAction(view, action);
          }}
        />
      )}
      <div className={`flex flex-1 w-full overflow-hidden ${minimapVisible ? 'hide-scrollbar' : ''}`}>
        <div
          ref={containerRef}
          className="flex-1 h-full overflow-hidden"
          style={{ fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", "Microsoft YaHei", "PingFang SC", "Noto Sans SC", monospace' }}
        >
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={contextMenu.items}
              onClose={() => setContextMenu(null)}
            />
          )}
        </div>
        {minimapVisible && <Minimap viewRef={viewRef} theme={theme} />}
      </div>
    </div>
  );
};

export default React.memo(CmEditor);
