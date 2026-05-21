import React, { useRef, useEffect } from 'react';
import { EditorView, keymap, highlightWhitespace, highlightTrailingWhitespace } from '@codemirror/view';
import { EditorState, StateEffect } from '@codemirror/state';
import { eolMarkers } from '../utils/showInvisibles';
import { resolveThemeColors } from '../utils/themeResolver';
import type { ThemeMode, LineEnding } from '../types';
import { perf } from '../utils/perf';
import { setColumnAlign, createColumnDragLayer } from '../utils/columnAlign';
import type { Language } from '../types';
import { getLanguageExtensionsSync } from '../utils/languageExtensions';
import { buildDynamicTheme } from '../utils/themes';
import { getLinterExtension } from '../utils/lint';
import { getAutocompleteExtension } from '../utils/autocomplete';
import { unicodeHighlight as unicodeHighlightExt } from '../utils/unicodeHighlight';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';
import { indentGuides } from '../utils/indentGuides';
import { hoverInfo } from '../utils/hover';
import { bracketColorization } from '../utils/bracketColorization';
import { signatureHelp } from '../utils/signatureHelp';
import { columnAlignExtension } from '../utils/columnAlign';
import { markedLinesField, pairGutter, bracketAndTagMatcher } from '../utils/bracketTagMatching';
import {
  getEditorState,
  setEditorState,
  setActiveView,
  getEditorScrollTop,
  setEditorScrollTop,
  notifyContentChange,
  notifyEditorUpdate,
  takePendingScrollTop,
  takePendingSelection,
} from '../hooks/useEditorStatePool';
import ContextMenu from './ContextMenu';
import Minimap from './Minimap';
import { useEditorStore } from '../hooks/useEditorStore';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { executeMarkdownAction } from '../utils/markdownActions';
import MarkdownToolbar from './MarkdownToolbar';
import { getOrCreateCompartments, buildBaseExtensions, loadLanguageExtensions, type EditorCompartments } from '../utils/editorExtensions';
import { useEditorContextMenu } from '../hooks/useEditorContextMenu';

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
  lineEnding?: LineEnding;
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
  lineEnding,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentsRef = useRef<EditorCompartments | null>(null);
  if (compartmentsRef.current == null) {
    compartmentsRef.current = getOrCreateCompartments(tabId);
  }

  const { contextMenu, setContextMenu, handleContextMenu } = useEditorContextMenu(viewRef, language, tabId);

  // Subscribe to custom colors from settings store for dynamic theme resolution
  const lightCustomColors = useSettingsStore((s) => s.lightCustomColors);
  const darkCustomColors = useSettingsStore((s) => s.darkCustomColors);
  const customColors = useSettingsStore((s) => s.customColors);

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
      const lineSepExt = lineEnding === 'CRLF'
        ? EditorState.lineSeparator.of('\r\n')
        : lineEnding === 'CR'
        ? EditorState.lineSeparator.of('\r')
        : EditorState.lineSeparator.of('\n');

      state = EditorState.create({
        doc: initialContent,
        extensions: [
          compartmentsRef.current!.lineSeparator.of(lineSepExt),
          ...buildBaseExtensions(compartmentsRef.current!, language, resolveThemeColors(theme, lightCustomColors, darkCustomColors, customColors), fontSize, readOnly, largeFileOptimize, wordWrap, showWhitespace, enableScrollPastEnd, tabId, enableUnicodeHighlight, theme !== 'light'),
          EditorView.updateListener.of((update) => {
            // Always save state to pool so that effects (language/theme changes)
            // are persisted, not just doc changes.
            setEditorState(tabId, update.state);
            if (update.docChanged) {
              useEditorStore.getState().markTabDirty(tabId, true);
              notifyContentChange(tabId);
            }
            notifyEditorUpdate(tabId);
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
    notifyEditorUpdate(tabId);

    // (contextmenu binding moved to a dedicated useEffect below to match original code)

    // Real-time scroll position saving so we always have the latest value
    const scroller = view.scrollDOM;
    const onScroll = () => {
      setEditorScrollTop(tabId, scroller.scrollTop);
    };
    scroller.addEventListener('scroll', onScroll);

    // Restore previous scroll position for this tab
    const savedScrollTop = getEditorScrollTop(tabId);
    const pendingScroll = takePendingScrollTop(tabId);
    const targetScrollTop = pendingScroll ?? savedScrollTop;

    const restoreScroll = () => {
      if (viewRef.current && targetScrollTop !== undefined) {
        viewRef.current.scrollDOM.scrollTop = targetScrollTop;
      }
    };

    // Try restoring immediately, after rAF, and after delays.
    // CM6 may reset scrollTop during initial layout or async reconfiguration,
    // so we restore multiple times.
    restoreScroll();
    requestAnimationFrame(restoreScroll);
    setTimeout(restoreScroll, 50);
    setTimeout(restoreScroll, 200);

    // Restore pending selection from session restore
    const pendingSel = takePendingSelection(tabId);
    if (pendingSel) {
      view.dispatch({
        selection: { anchor: pendingSel.anchor, head: pendingSel.head },
      });
    }

    // Ensure wordWrap is applied even when reusing a pooled state with stale config
    view.dispatch({
      effects: compartmentsRef.current!.wordWrap.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });

    // Ensure whitespace visibility is applied even when reusing a pooled state
    view.dispatch({
      effects: compartmentsRef.current!.whitespace.reconfigure(
        showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace(), eolMarkers] : []
      ),
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
        effects: compartmentsRef.current!.language.reconfigure(exts),
      });
      // Re-apply scroll position after language extension changes layout
      const latestScrollTop = getEditorScrollTop(tabId);
      if (latestScrollTop !== undefined && viewRef.current) {
        viewRef.current.scrollDOM.scrollTop = latestScrollTop;
      }
    }).catch((err) => {
      console.error(`[CmEditor] Failed to load language ${language}:`, err);
    });

    return () => {
      cancelled = true;
      dblClickCleanup?.();
      scroller.removeEventListener('scroll', onScroll);
      // (contextmenu unbinding handled in dedicated useEffect below)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, largeFileOptimize]);

  // Context menu binding — kept in a dedicated useEffect with [handleContextMenu]
  // dependency so the listener is always attached to the latest callback.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('contextmenu', handleContextMenu);
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleContextMenu]);

  // Dynamic reconfiguration: language (async load heavy packs)
  const langNonceRef = useRef(0);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    let cancelled = false;
    const nonce = ++langNonceRef.current;
    console.log('[CmEditor] language change:', language, 'tabId:', tabId);

    // Apply lightweight extension immediately (clears old highlighting for heavy langs)
    view.dispatch({
      effects: [
        compartmentsRef.current!.language.reconfigure(getLanguageExtensionsSync(language)),
        compartmentsRef.current!.lint.reconfigure(getLinterExtension(language) || []),
        compartmentsRef.current!.autocomplete.reconfigure(getAutocompleteExtension(language, tabId) || []),
      ],
    });
    setEditorState(tabId, view.state);

    // Then load heavy pack in background
    loadLanguageExtensions(language).then((exts) => {
      // Ignore stale responses from rapid language switches or unmount
      if (cancelled || nonce !== langNonceRef.current) {
        console.log('[CmEditor] language change stale, ignoring', language);
        return;
      }
      if (viewRef.current) {
        viewRef.current.dispatch({
          effects: compartmentsRef.current!.language.reconfigure(exts),
        });
        setEditorState(tabId, viewRef.current.state);
      }
    }).catch((err) => {
      console.error(`[CmEditor] Failed to load language ${language}:`, err);
    });

    return () => {
      cancelled = true;
    };
  }, [language, tabId]);

  // Dynamic reconfiguration: theme
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const colors = resolveThemeColors(theme, lightCustomColors, darkCustomColors, customColors);
    view.dispatch({
      effects: compartmentsRef.current!.theme.reconfigure(buildDynamicTheme(colors, theme !== 'light')),
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
      effects: compartmentsRef.current!.fontSize.reconfigure(
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
      effects: compartmentsRef.current!.readOnly.reconfigure(EditorView.editable.of(!readOnly)),
    });
    setEditorState(tabId, view.state);
  }, [readOnly, tabId]);

  // Dynamic reconfiguration: word wrap
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartmentsRef.current!.wordWrap.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
    setEditorState(tabId, view.state);
  }, [wordWrap, tabId]);

  // Dynamic reconfiguration: show whitespace
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartmentsRef.current!.whitespace.reconfigure(
        showWhitespace ? [highlightWhitespace(), highlightTrailingWhitespace(), eolMarkers] : []
      ),
    });
    setEditorState(tabId, view.state);
  }, [showWhitespace, tabId]);

  // Dynamic reconfiguration: line ending
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const lineSepExt = lineEnding === 'CRLF'
      ? EditorState.lineSeparator.of('\r\n')
      : lineEnding === 'CR'
      ? EditorState.lineSeparator.of('\r')
      : EditorState.lineSeparator.of('\n');
    view.dispatch({
      effects: compartmentsRef.current!.lineSeparator.reconfigure(lineSepExt),
    });
    setEditorState(tabId, view.state);
  }, [lineEnding, tabId]);

  // Dynamic reconfiguration: unicode highlight
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartmentsRef.current!.unicodeHighlight.reconfigure(enableUnicodeHighlight ? [...unicodeHighlightExt] : []),
    });
    setEditorState(tabId, view.state);
  }, [enableUnicodeHighlight, tabId]);

  // Dynamic reconfiguration: large file optimize (disable heavy features + foldGutter)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (largeFileOptimize) {
      view.dispatch({
        effects: [
          compartmentsRef.current!.largeFile.reconfigure([]),
          compartmentsRef.current!.heavyFeatures.reconfigure([]),
        ],
      });
      setEditorState(tabId, view.state);
      return;
    }

    // Restore heavy features when leaving large-file mode
    const heavyExts = [
      markedLinesField,
      pairGutter,
      bracketAndTagMatcher,
      highlightSelectionMatches(),
      ...(getLinterExtension(language) ? [getLinterExtension(language)!] : []),
      ...(getAutocompleteExtension(language, tabId) ? [getAutocompleteExtension(language, tabId)!] : []),
      ...indentGuides,
      hoverInfo,
      bracketColorization,
      signatureHelp(),
      columnAlignExtension,
    ];
    view.dispatch({
      effects: [
        compartmentsRef.current!.largeFile.reconfigure([foldGutter({ openText: '▼', closedText: '▶' }), keymap.of(foldKeymap)]),
        compartmentsRef.current!.heavyFeatures.reconfigure(heavyExts),
      ],
    });
    setEditorState(tabId, view.state);
  }, [largeFileOptimize, tabId, language]);

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

  // Effect 1: Toggle column-align via state effect
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const effects: StateEffect<unknown>[] = [];
    if (columnAlignEnabled) {
      const savedWidths = tabColumnWidthsRef.current[tabId] || [];
      effects.push(setColumnAlign.of({ enabled: true, widths: savedWidths }));
    } else {
      effects.push(setColumnAlign.of({ enabled: false, widths: [] }));
    }
    view.dispatch({ effects });
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
              onClose={() => setContextMenu()}
            />
          )}
        </div>
        {minimapVisible && <Minimap tabId={tabId} viewRef={viewRef} theme={theme} />}
      </div>
    </div>
  );
};

export default React.memo(CmEditor);
