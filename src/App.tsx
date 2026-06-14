import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus, FolderOpen, Save, Search, Braces, PanelLeft, Sun, Moon, WrapText, Space, BookOpen, Columns2, GitCompare, X, Eye, Table, ListTree, Maximize2 } from 'lucide-react';
import { useEditorStore } from './hooks/useEditorStore';
import { useSettingsStore } from './hooks/useSettingsStore';
import { useUIStore } from './hooks/useUIStore';
import { useFileOpener, normalizePath } from './hooks/useFileOpener';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useSessionRestore, saveSession, recordUserOpenedFile, waitForSessionRestore } from './hooks/useSessionRestore';
import { useMru } from './hooks/useMru';
import { getEditorContent, updateEditorContent, getActiveView, setPendingLineNumber } from './hooks/useEditorStatePool';
import { formatDocument, goToDefinition } from './utils/cmCommands';
import { perf } from './utils/perf';
import type { Encoding, LineEnding } from './types';
import { detectLineEnding, normalizeLineEnding } from './utils/lineEnding';
import { preloadCommonLanguages, loadLanguageExtensions, isLanguageCached } from './utils/languageExtensions';
import { resolveThemeColors } from './utils/themeResolver';
import { injectThemeVars, applySavedTheme } from './utils/themeInjector';
import Toolbar from './components/Toolbar';
import TabBar from './components/TabBar';
import FindReplace from './components/FindReplace';
import StatusBar from './components/StatusBar';
import Sidebar from './components/Sidebar';
import SettingsPanel from './components/SettingsPanel';
import MarkdownPreview from './components/MarkdownPreview';
import MarkdownReader from './components/MarkdownReader';
import HtmlPreview from './components/HtmlPreview';
import HtmlReader from './components/HtmlReader';
import CmEditor from './components/CmEditor';
import DiffEditor from './components/DiffEditor';
import JsonFormPanel from './components/JsonFormPanel';
import CommandPalette from './components/CommandPalette';
import TitleBar from './components/TitleBar';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import QuickOpen from './components/QuickOpen';
import ExternalChangeDialog from './components/ExternalChangeDialog';
import SearchResultsView from './components/SearchResultsView';
import type { SearchMatch, SearchOptions } from './services/searchService';
import { searchDirectory } from './services/searchService';
import { desktopApi, dirname, joinPath } from './platform/desktop';

const SEARCH_RESULTS_PATH = '__search_results__';

// Apply saved theme as early as possible to avoid flash
applySavedTheme();

function App() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeGroup1TabId = useEditorStore((s) => s.activeGroup1TabId);
  const activeGroup2TabId = useEditorStore((s) => s.activeGroup2TabId);
  const theme = useSettingsStore((s) => s.theme);
  const lightCustomColors = useSettingsStore((s) => s.lightCustomColors);
  const darkCustomColors = useSettingsStore((s) => s.darkCustomColors);
  const customColors = useSettingsStore((s) => s.customColors);
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const findReplaceVisible = useUIStore((s) => s.findReplaceVisible);
  const unicodeHighlight = useSettingsStore((s) => s.unicodeHighlight);
  const fontSize = useSettingsStore((s) => s.fontSize);

  // Refs for keyboard shortcuts — always point to latest callbacks
  const handleNewFileRef = useRef<(() => void) | null>(null);
  const handleOpenFileRef = useRef<(() => void) | null>(null);
  const handleSaveFileRef = useRef<(() => void) | null>(null);
  const handleFormatRef = useRef<(() => void) | null>(null);
  const findReplaceVisibleRef = useRef(findReplaceVisible);
  const columnAlignSupportedRef = useRef(false);
  const columnAlignSupported = useSettingsStore((s) => s.columnAlignSupported);

  // Keep all callback refs up-to-date outside of render phase
  useEffect(() => {
    findReplaceVisibleRef.current = findReplaceVisible;
  });
  useEffect(() => {
    columnAlignSupportedRef.current = columnAlignSupported;
  });
  const previewVisible = useUIStore((s) => s.previewVisible);
  const splitMode = useEditorStore((s) => s.splitMode);
  const projectPath = useEditorStore((s) => s.projectPath);
  const largeFileOptimize = useSettingsStore((s) => s.largeFileOptimize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const showWhitespace = useSettingsStore((s) => s.showWhitespace);
  const scrollPastEnd = useSettingsStore((s) => s.scrollPastEnd);
  const minimapVisible = useSettingsStore((s) => s.minimapVisible);
  const diffMode = useEditorStore((s) => s.diffMode);
  const diffLeftTabId = useEditorStore((s) => s.diffLeftTabId);
  const diffRightTabId = useEditorStore((s) => s.diffRightTabId);
  const readMode = useUIStore((s) => s.readMode);
  const diagnosticsPanelVisible = useUIStore((s) => s.diagnosticsPanelVisible);
  const setDiagnosticsPanelVisible = useUIStore((s) => s.setDiagnosticsPanelVisible);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || null);
  const columnAlignEnabled = activeTab?.columnAlignEnabled ?? false;
  const setTabColumnAlign = useEditorStore((s) => s.setTabColumnAlign);

  const setActiveTabId = useEditorStore((s) => s.setActiveTabId);
  const setActiveGroup1TabId = useEditorStore((s) => s.setActiveGroup1TabId);
  const setActiveGroup2TabId = useEditorStore((s) => s.setActiveGroup2TabId);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setSidebarVisible = useUIStore((s) => s.setSidebarVisible);
  const setFindReplaceVisible = useUIStore((s) => s.setFindReplaceVisible);
  const setPreviewVisible = useUIStore((s) => s.setPreviewVisible);
  const setSplitMode = useEditorStore((s) => s.setSplitMode);
  const setProjectPath = useEditorStore((s) => s.setProjectPath);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [searchResultsMap, setSearchResultsMap] = useState<Record<string, {
    query: string;
    directory: string;
    matches: SearchMatch[];
  }>>({});
  const [searchLoadingMap, setSearchLoadingMap] = useState<Record<string, boolean>>({});
  const findReplaceRef = useRef<{ setFolderMode: (v: boolean) => void } | null>(null);
  const [externalChangeNotice, setExternalChangeNotice] = useState<string | null>(null);
  const [externalDiff, setExternalDiff] = useState<{
    open: boolean;
    filePath: string;
    currentContent: string;
    externalContent: string;
    externalEncoding: string;
    tabId: string;
  } | null>(null);
  const { items: mruItems } = useMru();
  const setTabEncoding = useEditorStore((s) => s.setTabEncoding);
  const setTabLineEnding = useEditorStore((s) => s.setTabLineEnding);
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);
  const createTab = useEditorStore((s) => s.createTab);
  const markTabDirty = useEditorStore((s) => s.markTabDirty);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeTabs = useEditorStore((s) => s.closeTabs);
  const markTabSaved = useEditorStore((s) => s.markTabSaved);
  const renameTab = useEditorStore((s) => s.renameTab);
  const moveTabToGroup = useEditorStore((s) => s.moveTabToGroup);
  const reorderTab = useEditorStore((s) => s.reorderTab);
  const setReadMode = useUIStore((s) => s.setReadMode);
  const jsonFormVisible = useUIStore((s) => s.jsonFormVisible);
  const setJsonFormVisible = useUIStore((s) => s.setJsonFormVisible);
  const jsonFormFullScreen = useUIStore((s) => s.jsonFormFullScreen);
  const setJsonFormFullScreen = useUIStore((s) => s.setJsonFormFullScreen);

  const openFile = useFileOpener();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [readerScrollToTop, setReaderScrollToTop] = useState(false);
  const SIDEBAR_WIDTH = 220;
  const handleFileChanged = useCallback(async (changedPath: string) => {
    const tab = useEditorStore.getState().tabs.find((t) => t.filePath === changedPath);
    if (!tab) return;

    let externalText: string;
    let externalEncoding: string;
    try {
      const result = await desktopApi.readFileAuto(changedPath);
      externalText = result.text;
      externalEncoding = result.encoding;
    } catch (err) {
      console.error('Failed to read externally changed file:', err);
      return;
    }

    const stillTab = useEditorStore.getState().tabs.find((t) => t.filePath === changedPath);
    if (!stillTab) return;

    // If no unsaved changes, silently reload and show a transient notice
    if (!tab.isDirty) {
      updateEditorContent(stillTab.id, externalText);
      markTabSaved(stillTab.id);
      setTabEncoding(stillTab.id, externalEncoding as Encoding);
      setTabLineEnding(stillTab.id, detectLineEnding(externalText));
      setExternalChangeNotice('已同步外部变更');
      window.setTimeout(() => setExternalChangeNotice(null), 2500);
      return;
    }

    // If there are unsaved changes, show diff dialog
    const currentContent = getEditorContent(stillTab.id);
    setExternalDiff({
      open: true,
      filePath: changedPath,
      currentContent,
      externalContent: externalText,
      externalEncoding,
      tabId: stillTab.id,
    });
  }, [markTabSaved, setTabEncoding, setTabLineEnding]);

  const { pauseWatch, resumeWatch } = useFileWatcher(tabs, handleFileChanged);

  // Auto-disable split when less than 2 tabs
  useEffect(() => {
    if (splitMode && tabs.length < 2) {
      setSplitMode(false);
    }
  }, [tabs.length, splitMode, setSplitMode]);

  // Preload language packs for currently open tabs during idle time
  useEffect(() => {
    const langs = new Set(tabs.map((t) => t.language));
    const idleCallback =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 500);
    const handle = idleCallback(() => {
      for (const lang of langs) {
        if (!isLanguageCached(lang)) {
          loadLanguageExtensions(lang).catch(() => {});
        }
      }
    });
    return () => {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(handle as number);
      } else {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
    };
  }, [tabs]);

  // Show window after paint completes to avoid blank screen
  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        desktopApi.windowShow().catch(() => {});
      });
    });
  }, []);

  // Preload common language packs on startup
  useEffect(() => {
    preloadCommonLanguages();
  }, []);

  // Listen for file open events from backend (single instance / file association)
  useEffect(() => {
    if (!desktopApi.isDesktop()) return;

    const unlisten = desktopApi.onOpenFile((filePath) => {
      recordUserOpenedFile(filePath);
      openFile(filePath);
    });

    desktopApi.getPendingFiles()
      .then(async (files) => {
        if (files.length > 0) {
          recordUserOpenedFile(files[files.length - 1]);
        }
        // Wait for session restore to finish so openFile can detect
        // already-restored tabs and avoid duplicate creation.
        await waitForSessionRestore();
        for (const filePath of files) {
          openFile(filePath);
        }
      })
      .catch((err) => {
        console.error('Failed to get pending files:', err);
      });

    return () => {
      unlisten();
    };
  }, [openFile]);

  // Keyboard shortcuts — refs guarantee we always call the latest callbacks
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            handleNewFileRef.current?.();
            break;
          case 'o':
            e.preventDefault();
            handleOpenFileRef.current?.();
            break;
          case 's':
            e.preventDefault();
            handleSaveFileRef.current?.();
            break;
          case 'f':
            e.preventDefault();
            setFindReplaceVisible(!findReplaceVisibleRef.current);
            break;
        }
      }
      // Format document shortcut
      if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleFormatRef.current?.();
      }
      // Command palette shortcut
      if (e.key === 'F1') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
      // Quick open shortcut: Ctrl+P
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault();
        setQuickOpenOpen((v) => !v);
      }
      // Find in folder shortcut: Ctrl+Shift+F
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindReplaceVisible(true);
        findReplaceRef.current?.setFolderMode(true);
      }
      // Read mode toggle: Ctrl+Shift+V
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const ui = useUIStore.getState();
        if (ui.readMode) {
          setReadMode(false);
        } else {
          const tab = activeTabRef.current;
          if (tab?.language === 'markdown' || tab?.language === 'html') {
            setReadMode(true);
          } else {
            console.warn('[ReadMode] 仅对 Markdown 和 HTML 文件可用');
          }
        }
      }
      // Column align toggle: Ctrl+Shift+T (only when supported)
      if (columnAlignSupportedRef.current && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        const tab = activeTabRef.current;
        if (tab) {
          setTabColumnAlign(tab.id, !(tab.columnAlignEnabled ?? false));
        }
      }
      // JSON form panel toggle: Ctrl+Shift+J
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const tab = activeTabRef.current;
        if (tab && (tab.language === 'json' || tab.language === 'jsonl')) {
          useUIStore.getState().setJsonFormVisible(!useUIStore.getState().jsonFormVisible);
        }
      }
      // Esc: exit JSON form full screen
      if (e.key === 'Escape' && useUIStore.getState().jsonFormFullScreen) {
        e.preventDefault();
        useUIStore.getState().setJsonFormFullScreen(false);
      }
      // Go to definition shortcut (only intercept in Tauri; let F12 open DevTools in browser)
      if (e.key === 'F12' && desktopApi.isDesktop()) {
        e.preventDefault();
        const currentTab = activeTabRef.current;
        if (currentTab) {
          const view = getActiveView(currentTab.id);
          if (view) {
            const ok = goToDefinition(view);
            if (!ok) {
              console.warn('[GoToDef] 无法找到定义（当前仅支持同文件内跳转）');
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setFindReplaceVisible, setReadMode, setTabColumnAlign]);

  useSessionRestore();

  const handleNewFile = useCallback(() => {
    const group = activeTab?.group || 1;
    createTab('Untitled', undefined, undefined, group);
  }, [createTab, activeTab]);
  useEffect(() => {
    handleNewFileRef.current = handleNewFile;
  });

  const handleNewFileInGroup = useCallback((group: 1 | 2) => {
    createTab('Untitled', undefined, undefined, group);
  }, [createTab]);

  const handleOpenFile = useCallback(async () => {
    if (desktopApi.isDesktop()) {
      try {
        const paths = await desktopApi.openFileDialog({ multiple: true });
        for (const filePath of paths) {
          await openFile(filePath);
        }
      } catch (err) {
        console.log('Open cancelled or failed', err);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [openFile]);
  useEffect(() => {
    handleOpenFileRef.current = handleOpenFile;
  });

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const filePromises: Promise<void>[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as { path?: string }).path || file.name;
        const fileName = file.name;

        filePromises.push((async () => {
          try {
            if (desktopApi.isDesktop() && filePath) {
              await openFile(filePath);
            } else {
              const text = await file.text();
              const currentTabs = useEditorStore.getState().tabs;
              const existing = currentTabs.find((t) => t.title === fileName);
              const lineEnding = detectLineEnding(text);
              if (existing) {
                setActiveTabId(existing.id);
                setTabLineEnding(existing.id, lineEnding);
                updateEditorContent(existing.id, text);
              } else {
                createTab(fileName, undefined, undefined, 1, 'UTF-8', text, lineEnding);
              }
            }
          } catch (err) {
            console.error('Failed to read file:', fileName, err);
            if (desktopApi.isDesktop() && filePath) {
              console.warn(`[OpenFile] 无法读取文件: ${fileName}`);
            }
          }
        })());
      }

      await Promise.all(filePromises);
      e.target.value = '';
    },
    [openFile, setActiveTabId, createTab, setTabLineEnding]
  );

  const handleSaveFile = useCallback(async () => {
    if (!activeTab) return;

    try {
      if (desktopApi.isDesktop() && activeTab.filePath) {
        const content = normalizeLineEnding(getEditorContent(activeTab.id), activeTab.lineEnding);
        await pauseWatch(activeTab.filePath);
        await desktopApi.writeFile(activeTab.filePath, content, activeTab.encoding);
        await resumeWatch(activeTab.filePath);
        markTabSaved(activeTab.id);
        return;
      }

      if ('showSaveFilePicker' in window) {
        const pickerOpts = {
          suggestedName: activeTab.title,
          types: [
            {
              description: 'Text Files',
              accept: { 'text/plain': ['.txt', '.md', '.js', '.ts', '.html', '.css', '.json', '.py', '.rs'] },
            },
          ],
        };
        // @ts-expect-error showSaveFilePicker is not in standard DOM types yet
        const handle = await window.showSaveFilePicker(pickerOpts);
        const writable = await handle.createWritable();
        await writable.write(normalizeLineEnding(getEditorContent(activeTab.id), activeTab.lineEnding));
        await writable.close();
        markTabSaved(activeTab.id);
        renameTab(activeTab.id, handle.name);
      } else {
        const blob = new Blob([normalizeLineEnding(getEditorContent(activeTab.id), activeTab.lineEnding)], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeTab.title;
        a.click();
        URL.revokeObjectURL(url);
        markTabSaved(activeTab.id);
      }
    } catch (err) {
      // Ignore user cancellation (file picker abort)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : String(err));
      console.error('Save failed:', err);

      // Resume file watch if it was paused for a Tauri save attempt
      if (desktopApi.isDesktop() && activeTab?.filePath) {
        await resumeWatch(activeTab.filePath).catch(() => {});
      }

      await desktopApi.message(msg, { title: '保存失败', kind: 'error' });
    }
  }, [activeTab, markTabSaved, renameTab, pauseWatch, resumeWatch]);
  useEffect(() => {
    handleSaveFileRef.current = handleSaveFile;
  });

  const handleOpenFolder = useCallback(async () => {
    if (!desktopApi.isDesktop()) return;
    try {
      const selected = await desktopApi.openFolderDialog();
      if (selected) setProjectPath(selected);
    } catch (err) {
      console.error('[OpenFolder] failed:', err);
    }
  }, [setProjectPath]);

  const handleSidebarOpenFile = useCallback(
    async (filePath: string) => {
      if (!desktopApi.isDesktop()) return;
      const existing = useEditorStore.getState().tabs.find((t) => normalizePath(t.filePath || '') === normalizePath(filePath));
      if (existing) {
        setReaderScrollToTop(false);
        setActiveTabId(existing.id);
      } else {
        setReaderScrollToTop(true);
        await openFile(filePath);
      }
    },
    [openFile, setActiveTabId]
  );

  /** Open a file from search results and scroll to the matched line. */
  const handleOpenSearchResult = useCallback(
    async (filePath: string, lineNumber: number) => {
      const existing = useEditorStore.getState().tabs.find((t) => normalizePath(t.filePath || '') === normalizePath(filePath));
      if (existing) {
        // Already open — switch and jump immediately
        setActiveTabId(existing.id);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const view = getActiveView(existing.id);
            if (view) {
              const targetLine = Math.min(lineNumber, view.state.doc.lines);
              const pos = view.state.doc.line(targetLine).from;
              view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
            }
          });
        });
        return;
      }

      // Not yet open — open it and set pending line number for CmEditor to apply on mount
      await openFile(filePath);
      const openedTab = useEditorStore.getState().tabs.find((t) => normalizePath(t.filePath || '') === normalizePath(filePath));
      if (openedTab) {
        setActiveTabId(openedTab.id);
        setPendingLineNumber(openedTab.id, lineNumber);
      }
    },
    [openFile, setActiveTabId]
  );

  const handleTabClick = useCallback((id: string, group: 1 | 2) => {
    setReaderScrollToTop(false);
    const switchStart = performance.now();
    if (group === 1) {
      setActiveGroup1TabId(id);
    } else {
      setActiveGroup2TabId(id);
    }
    setActiveTabId(id);
    // Defer measurement to after React render + CM6 setState
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        perf.recordTabSwitch(performance.now() - switchStart);
      });
    });
  }, [setActiveGroup1TabId, setActiveGroup2TabId, setActiveTabId]);

  const handleTabClose = useCallback((id: string) => {
    setSearchResultsMap((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return prev;
    });
    setSearchLoadingMap((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return prev;
    });
    closeTab(id);
  }, [closeTab]);

  const handleCloseTabs = useCallback((ids: string[]) => {
    setSearchResultsMap((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        delete next[id];
      }
      return next;
    });
    setSearchLoadingMap((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        delete next[id];
      }
      return next;
    });
    closeTabs(ids);
  }, [closeTabs]);

  const handleRenameTab = useCallback(async (tabId: string, newTitle: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.filePath && desktopApi.isDesktop()) {
      try {
        const dir = dirname(tab.filePath);
        const newPath = joinPath(dir, newTitle);
        await desktopApi.renameFile(tab.filePath, newPath);
        renameTab(tabId, newTitle, newPath);
      } catch (err) {
        console.error('[Rename] 重命名文件失败:', err);
        // 文件重命名失败，仍然更新标签标题
        renameTab(tabId, newTitle);
      }
    } else {
      renameTab(tabId, newTitle);
    }
  }, [tabs, renameTab]);

  // Inject CSS theme variables whenever theme or custom colors change
  useEffect(() => {
    const colors = resolveThemeColors(theme, lightCustomColors, darkCustomColors, customColors);
    injectThemeVars(colors);
  }, [theme, lightCustomColors, darkCustomColors, customColors]);

  const handleCycleTheme = useCallback(() => {
    setTheme((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'custom';
      return 'light';
    });
  }, [setTheme]);

  const handleLineEndingChange = useCallback(
    (ending: LineEnding) => {
      if (!activeTab) return;
      setTabLineEnding(activeTab.id, ending);
      markTabDirty(activeTab.id, true);
      // Note: listeners (e.g. previews) are notified via CmEditor's lineEnding effect,
      // which calls notifyContentChange after updating lineSeparator.
    },
    [activeTab, setTabLineEnding, markTabDirty]
  );

  const handleEncodingChange = useCallback(
    async (enc: Encoding) => {
      if (!activeTab) return;
      const tabId = activeTab.id;
      const filePath = activeTab.filePath;
      console.log('[EncodingChange] switching encoding:', enc, 'tabId:', tabId, 'filePath:', filePath);
      setTabEncoding(tabId, enc);

      if (desktopApi.isDesktop() && filePath) {
        try {
          const { text } = await desktopApi.readFileWithEncoding(filePath, enc);
          console.log('[EncodingChange] re-read file, length:', text.length);
          updateEditorContent(tabId, text);
        } catch (err) {
          console.error('[EncodingChange] failed to re-read file with encoding:', enc, err);
        }
      } else {
        console.log('[EncodingChange] skipped re-read (not Tauri or no filePath)');
      }
    },
    [activeTab, setTabEncoding]
  );

  const isDark = theme === 'dark';

  // Handle file drop using Tauri native drag-drop events
  useEffect(() => {
    if (!desktopApi.isDesktop()) return;

    let processing = false;
    const p1 = desktopApi.onDragDropEvent((paths) => {
      if (processing) return;
      processing = true;
      setTimeout(() => { processing = false; }, 500);
      for (const filePath of paths) {
        desktopApi.readFileAuto(filePath)
          .then((result) => {
            openFile(filePath, { text: result.text, encoding: result.encoding });
          })
          .catch((err) => {
            console.error('Failed to read dropped file:', filePath, err);
          });
      }
    });

    return () => {
      p1.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [openFile]);

  // Window close confirmation (Tauri + browser)
  useEffect(() => {
    const getStore = useEditorStore.getState;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      saveSession();
      if (getStore().tabs.some((t) => t.isDirty)) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Browser fallback: HTML5 Drag and Drop
  useEffect(() => {
    if (desktopApi.isDesktop()) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = file.name;

        try {
          const text = await file.text();
          const currentTabs = useEditorStore.getState().tabs;
          const existing = currentTabs.find((t) => t.title === fileName);
          const lineEnding = detectLineEnding(text);
          if (existing) {
            setActiveTabId(existing.id);
            setTabLineEnding(existing.id, lineEnding);
            updateEditorContent(existing.id, text);
          } else {
            createTab(fileName, undefined, undefined, 1, 'UTF-8', text, lineEnding);
          }
        } catch (err) {
          console.error('Failed to read dropped file:', fileName, err);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [setActiveTabId, createTab, setTabLineEnding]);

  const canFormat = !!activeTab;

  const handleFormat = useCallback(async () => {
    if (!activeTab) {
      if (desktopApi.isDesktop()) await desktopApi.message('没有打开的文件，请先打开或新建一个文件。', { title: '格式化' });
      else alert('没有打开的文件，请先打开或新建一个文件。');
      return;
    }
    const view = getActiveView(activeTab.id);
    if (!view) {
      if (desktopApi.isDesktop()) await desktopApi.message('无法获取编辑器实例，请尝试切换标签页后重试。', { title: '格式化' });
      else alert('无法获取编辑器实例，请尝试切换标签页后重试。');
      return;
    }
    // Smart scope: selection if any, otherwise full document
    const sel = view.state.selection.main;
    const scope = (sel.from !== sel.to) ? 'selection' : 'full';
    const ok = formatDocument(view, activeTab.language, scope);
    if (ok) {
      markTabDirty(activeTab.id, true);
    } else {
      const msg = scope === 'selection'
        ? '格式化失败：请确保选区内容是有效的可格式化文本（如 JSON、XML、CSS、SQL 等）。'
        : '格式化失败：当前文件类型暂不支持全文格式化，或 JSON 存在语法错误。';
      if (desktopApi.isDesktop()) await desktopApi.message(msg, { title: '格式化' });
      else alert(msg);
    }
  }, [activeTab, markTabDirty]);
  useEffect(() => {
    handleFormatRef.current = handleFormat;
  });

  const handleToggleSplit = useCallback(() => {
    setSplitMode(!splitMode);
  }, [splitMode, setSplitMode]);

  const handleToggleDiff = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.diffMode) {
      // Exit diff mode
      useEditorStore.getState().setDiffMode(false);
      useEditorStore.getState().setDiffPair(null, null);
    } else {
      // Enter diff mode with current two tabs
      const g1 = state.activeGroup1TabId;
      const g2 = state.activeGroup2TabId;
      if (g1 && g2) {
        useEditorStore.getState().setDiffPair(g1, g2);
        useEditorStore.getState().setDiffMode(true);
      } else if (state.tabs.length >= 2) {
        // Use first two tabs
        useEditorStore.getState().setDiffPair(state.tabs[0].id, state.tabs[1].id);
        useEditorStore.getState().setDiffMode(true);
      } else {
        console.warn('[Diff] 需要至少两个打开的文件才能对比');
      }
    }
  }, []);

  const handleToggleReadMode = useCallback(() => {
    const state = useUIStore.getState();
    if (state.readMode) {
      setReadMode(false);
    } else {
      if (activeTab?.language === 'markdown' || activeTab?.language === 'html') {
        setReadMode(true);
      } else {
        console.warn('[ReadMode] 仅对 Markdown 和 HTML 文件可用');
      }
    }
  }, [setReadMode, activeTab]);

  const handleReaderExit = useCallback(() => setReadMode(false), [setReadMode]);
  const handleReaderToggleTheme = useCallback(() => handleCycleTheme(), [handleCycleTheme]);

  const handleSearchInFolder = useCallback(async (query: string, options: SearchOptions, directory: string) => {
    // Reuse existing search-results tab or create a new one
    let targetTab = tabs.find((t) => t.filePath === SEARCH_RESULTS_PATH);
    if (targetTab) {
      setActiveTabId(targetTab.id);
    } else {
      targetTab = createTab(`查找结果: "${query}"`, 'plaintext', SEARCH_RESULTS_PATH);
    }

    setSearchLoadingMap((prev) => ({ ...prev, [targetTab.id]: true }));
    try {
      const matches = await searchDirectory(directory, options);
      setSearchResultsMap((prev) => ({
        ...prev,
        [targetTab.id]: { query, directory, matches },
      }));
    } catch (err) {
      console.error('[App] 文件夹搜索失败:', err);
      const errMsg = String(err);
      if (desktopApi.isDesktop()) {
        await desktopApi.message(errMsg, { title: '搜索失败', kind: 'error' });
      } else {
        alert(`搜索失败: ${errMsg}`);
      }
    } finally {
      setSearchLoadingMap((prev) => ({ ...prev, [targetTab.id]: false }));
    }
  }, [tabs, createTab, setActiveTabId]);

  const group1Tab = tabs.find((t) => t.id === activeGroup1TabId);
  const canPreview = group1Tab?.language === 'markdown' || group1Tab?.language === 'html';
  const canSplit = tabs.length >= 2;

  const previewTabs = useMemo(
    () => tabs.filter((t) => t.language === 'markdown' || t.language === 'html'),
    [tabs]
  );
  const readerTabs = useMemo(
    () => tabs.filter((t) => t.language === 'markdown' || t.language === 'html'),
    [tabs]
  );
  const group1Tabs = useMemo(
    () => tabs.filter((t) => t.group === 1 || !t.group),
    [tabs]
  );
  const group2Tabs = useMemo(
    () => tabs.filter((t) => t.group === 2),
    [tabs]
  );

  // Command palette items
  const commands = useMemo(() => [
    { id: 'new', label: '新建文件', shortcut: 'Ctrl+N', icon: <FilePlus size={16} />, action: handleNewFile },
    { id: 'open', label: '打开文件', shortcut: 'Ctrl+O', icon: <FolderOpen size={16} />, action: handleOpenFile },
    { id: 'save', label: '保存文件', shortcut: 'Ctrl+S', icon: <Save size={16} />, action: handleSaveFile },
    { id: 'find', label: '查找替换', shortcut: 'Ctrl+F', icon: <Search size={16} />, action: () => setFindReplaceVisible(!findReplaceVisible) },
    { id: 'findInFolder', label: '在文件夹中查找', shortcut: 'Ctrl+Shift+F', icon: <Search size={16} />, action: () => { setFindReplaceVisible(true); findReplaceRef.current?.setFolderMode(true); } },
    { id: 'format', label: '格式化文档', shortcut: 'Shift+Alt+F', icon: <Braces size={16} />, action: handleFormat },
    { id: 'sidebar', label: sidebarVisible ? '隐藏侧边栏' : '显示侧边栏', icon: <PanelLeft size={16} />, action: () => setSidebarVisible(!sidebarVisible) },
    { id: 'theme', label: `切换主题 (${theme})`, icon: isDark ? <Sun size={16} /> : <Moon size={16} />, action: handleCycleTheme },
    { id: 'wordwrap', label: wordWrap ? '关闭自动换行' : '开启自动换行', icon: <WrapText size={16} />, action: () => useSettingsStore.getState().setWordWrap(!wordWrap) },
    { id: 'whitespace', label: showWhitespace ? '隐藏空白字符' : '显示空白字符', icon: <Space size={16} />, action: () => useSettingsStore.getState().setShowWhitespace(!showWhitespace) },
    { id: 'preview', label: previewVisible ? '关闭预览' : '开启预览', icon: <BookOpen size={16} />, action: () => setPreviewVisible(!previewVisible) },
    { id: 'readmode', label: readMode ? '退出阅读模式' : '阅读模式', shortcut: 'Ctrl+Shift+V', icon: <Eye size={16} />, action: handleToggleReadMode },
    { id: 'split', label: splitMode ? '关闭分屏' : '开启分屏', icon: <Columns2 size={16} />, action: handleToggleSplit },
    { id: 'diff', label: diffMode ? '退出对比' : '对比文件', icon: diffMode ? <X size={16} /> : <GitCompare size={16} />, action: handleToggleDiff },
    ...(columnAlignSupported && activeTab ? [{
      id: 'columnAlign',
      label: (activeTab.columnAlignEnabled ?? false) ? '关闭列对齐' : '开启列对齐',
      shortcut: 'Ctrl+Shift+T',
      icon: <Table size={16} />,
      action: () => setTabColumnAlign(activeTab.id, !(activeTab.columnAlignEnabled ?? false)),
    }] : []),
    ...(activeTab && (activeTab.language === 'json' || activeTab.language === 'jsonl') ? [{
      id: 'jsonForm',
      label: jsonFormVisible ? '关闭 JSON 表单' : 'JSON 表单',
      shortcut: 'Ctrl+Shift+J',
      icon: <ListTree size={16} />,
      action: () => setJsonFormVisible(!jsonFormVisible),
    }, {
      id: 'jsonFormFullScreen',
      label: jsonFormFullScreen ? '退出 JSON 表单全屏' : 'JSON 表单全屏',
      icon: <Maximize2 size={16} />,
      action: () => {
        if (!jsonFormVisible) setJsonFormVisible(true);
        setJsonFormFullScreen(!jsonFormFullScreen);
      },
    }] : []),
    ...(activeTab?.filePath ? [{
      id: 'reveal',
      label: '在文件夹中显示',
      icon: <FolderOpen size={16} />,
      action: async () => {
        try {
          const filePath = activeTab.filePath;
          if (!filePath) return;
          await desktopApi.revealInFolder(filePath);
        } catch (err) {
          console.error('[Reveal] 打开文件夹失败:', err);
        }
      },
    }] : []),
  ], [handleNewFile, handleOpenFile, handleSaveFile, handleFormat, handleCycleTheme, handleToggleSplit, handleToggleDiff, handleToggleReadMode, findReplaceVisible, setFindReplaceVisible, sidebarVisible, setSidebarVisible, isDark, wordWrap, showWhitespace, previewVisible, setPreviewVisible, splitMode, diffMode, readMode, activeTab, theme, columnAlignSupported, setTabColumnAlign, jsonFormVisible, setJsonFormVisible, jsonFormFullScreen, setJsonFormFullScreen]);

  return (
    <div className={`flex flex-col h-screen ${theme !== 'light' ? 'dark' : ''}`}>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelected}
        accept=".txt,.md,.js,.jsx,.mjs,.cjs,.ts,.tsx,.mts,.cts,.html,.htm,.xhtml,.css,.scss,.sass,.less,.json,.jsonc,.json5,.py,.pyw,.java,.cpp,.cc,.cxx,.c,.h,.hpp,.cs,.rs,.go,.mdx,.yml,.yaml,.xml,.svg,.wsdl,.xsd,.xsl,.xslt,.sql,.mysql,.pgsql,.sqlite,.ini,.cfg,.inf,.csv,.tsv,.env,.properties,.log,.sh,.bash,.zsh"
      />

      <TitleBar title={activeTab ? activeTab.title : 'Text Editor'} isDark={isDark} />

      <Toolbar
        onNewFile={handleNewFile}
        onOpenFile={handleOpenFile}
        onOpenFolder={handleOpenFolder}
        onSaveFile={handleSaveFile}
        onToggleFindReplace={() => setFindReplaceVisible(!findReplaceVisible)}
        onToggleTheme={handleCycleTheme}
        onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
        onFormat={handleFormat}
        onTogglePreview={() => setPreviewVisible(!previewVisible)}
        onToggleSplit={handleToggleSplit}
        onToggleReadMode={handleToggleReadMode}
        onToggleSettings={() => setSettingsVisible((v) => !v)}
        onToggleJsonForm={() => setJsonFormVisible(!jsonFormVisible)}
        canFormat={canFormat}
        canPreview={canPreview}
        previewActive={previewVisible}
        canSplit={canSplit}
        splitActive={splitMode}
        canReadMode={!!activeTab && (activeTab.language === 'markdown' || activeTab.language === 'html')}
        readModeActive={readMode}
        canJsonForm={!!activeTab && (activeTab.language === 'json' || activeTab.language === 'jsonl')}
        jsonFormActive={jsonFormVisible}
        theme={theme}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          visible={sidebarVisible}
          width={SIDEBAR_WIDTH}
          projectPath={projectPath}
          onProjectChange={setProjectPath}
          onOpenFolder={handleOpenFolder}
          openTabs={tabs}
          onOpenFile={handleSidebarOpenFile}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            activeGroup1TabId={activeGroup1TabId}
            activeGroup2TabId={activeGroup2TabId}
            splitMode={splitMode}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onNewFile={handleNewFile}
            onNewFileInGroup={handleNewFileInGroup}
            onMoveTabToGroup={moveTabToGroup}
            onReorderTab={reorderTab}
            onCloseTabs={handleCloseTabs}
            onRenameTab={handleRenameTab}
          />

          <FindReplace
            visible={findReplaceVisible}
            onClose={() => setFindReplaceVisible(false)}
            projectPath={projectPath || undefined}
            activeTabFilePath={activeTab?.filePath}
            onSearchInFolder={handleSearchInFolder}
            folderModeRef={findReplaceRef}
          />
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
          <QuickOpen
            open={quickOpenOpen}
            onClose={() => setQuickOpenOpen(false)}
            mruItems={mruItems}
            openTabs={tabs.map((t) => ({ id: t.id, title: t.title, filePath: t.filePath }))}
            onOpenFile={(path) => {
              setReaderScrollToTop(true);
              openFile(path);
            }}
            onActivateTab={(id) => {
              const tab = tabs.find((t) => t.id === id);
              if (tab) {
                handleTabClick(id, (tab.group || 1) as 1 | 2);
              }
            }}
          />

          <div className="flex flex-1 overflow-hidden relative">
            {diffMode && diffLeftTabId && diffRightTabId ? (
              <DiffEditor
                leftContent={getEditorContent(diffLeftTabId)}
                rightContent={getEditorContent(diffRightTabId)}
                theme={theme}
              />
            ) : group1Tab ? (
              <>
                {group1Tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className="h-full flex-1 min-w-0"
                    style={{ display: tab.id === activeGroup1TabId ? 'flex' : 'none' }}
                  >
                    {tab.filePath === SEARCH_RESULTS_PATH ? (
                      <SearchResultsView
                        query={searchResultsMap[tab.id]?.query || ''}
                        directory={searchResultsMap[tab.id]?.directory || ''}
                        matches={searchResultsMap[tab.id]?.matches || []}
                        isLoading={searchLoadingMap[tab.id] || false}
                        onOpenFile={handleOpenSearchResult}
                      />
                    ) : (
                      <CmEditor
                        tabId={tab.id}
                        language={tab.language}
                        theme={theme}
                        fontSize={fontSize}
                        initialContent={tab.initialContent || ''}
                        largeFileOptimize={largeFileOptimize}
                        wordWrap={wordWrap}
                        showWhitespace={showWhitespace}
                        scrollPastEnd={scrollPastEnd}
                        minimapVisible={minimapVisible}
                        unicodeHighlight={unicodeHighlight}
                        columnAlignEnabled={columnAlignSupported && (tab.columnAlignEnabled ?? false)}
                        lineEnding={tab.lineEnding}
                      />
                    )}
                  </div>
                ))}
                {splitMode && (
                  <>
                    <div className="w-px bg-gray-200 dark:bg-gray-800 self-stretch flex-shrink-0" />
                    <div className="flex-1 h-full min-w-0">
                      {group2Tabs.length > 0 ? (
                        group2Tabs.map((tab) => (
                          <div
                            key={tab.id}
                            className="h-full w-full"
                            style={{ display: tab.id === activeGroup2TabId ? 'flex' : 'none' }}
                          >
                            {tab.filePath === SEARCH_RESULTS_PATH ? (
                              <SearchResultsView
                                query={searchResultsMap[tab.id]?.query || ''}
                                directory={searchResultsMap[tab.id]?.directory || ''}
                                matches={searchResultsMap[tab.id]?.matches || []}
                                isLoading={searchLoadingMap[tab.id] || false}
                                onOpenFile={handleOpenSearchResult}
                              />
                            ) : (
                              <CmEditor
                                tabId={tab.id}
                                language={tab.language}
                                theme={theme}
                                fontSize={fontSize}
                                initialContent={tab.initialContent || ''}
                                largeFileOptimize={largeFileOptimize}
                                wordWrap={wordWrap}
                                showWhitespace={showWhitespace}
                                scrollPastEnd={scrollPastEnd}
                                minimapVisible={minimapVisible}
                                unicodeHighlight={unicodeHighlight}
                                columnAlignEnabled={columnAlignSupported && (tab.columnAlignEnabled ?? false)}
                                lineEnding={tab.lineEnding}
                              />
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-900">
                          <p className="text-sm">选择标签页开始编辑</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {previewVisible &&
                  previewTabs.map((tab) => (
                    <React.Fragment key={tab.id}>
                      <div
                        className="w-px bg-gray-200 dark:bg-gray-800 self-stretch flex-shrink-0"
                        style={{ display: tab.id === activeGroup1TabId ? 'flex' : 'none' }}
                      />
                      <div
                        className="flex-1 h-full min-w-0"
                        style={{ display: tab.id === activeGroup1TabId ? 'flex' : 'none' }}
                      >
                        {tab.language === 'markdown' ? (
                          <MarkdownPreview tabId={tab.id} theme={theme} visible={tab.id === activeGroup1TabId} />
                        ) : (
                          <HtmlPreview tabId={tab.id} theme={theme} visible={tab.id === activeGroup1TabId} />
                        )}
                      </div>
                    </React.Fragment>
                  ))}
                {jsonFormVisible && !jsonFormFullScreen && activeTab && (activeTab.language === 'json' || activeTab.language === 'jsonl') && (
                  <>
                    <div className="w-px bg-gray-200 dark:bg-gray-800 self-stretch flex-shrink-0" />
                    <div className="flex-1 h-full min-w-0">
                      <JsonFormPanel
                        tabId={activeTab.id}
                        visible={jsonFormVisible}
                        fullScreen={false}
                        onToggleFullScreen={() => setJsonFormFullScreen(true)}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-900">
                <div className="text-center">
                  <p className="text-lg mb-2">没有打开的文件</p>
                  <p className="text-sm">点击"新建"或"打开"开始编辑</p>
                </div>
              </div>
            )}

            {/* Read Mode — shown inside editor area only */}
            {readMode &&
              readerTabs.map((tab) => (
                <div
                  key={tab.id}
                  className="absolute inset-0 z-30 flex flex-col"
                  style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
                >
                  {tab.language === 'markdown' ? (
                    <MarkdownReader
                      tabId={tab.id}
                      theme={theme}
                      onExit={handleReaderExit}
                      onToggleTheme={handleReaderToggleTheme}
                      shouldScrollToTop={readerScrollToTop && tab.id === activeTabId}
                      visible={tab.id === activeTabId}
                    />
                  ) : (
                    <HtmlReader
                      tabId={tab.id}
                      theme={theme}
                      onExit={handleReaderExit}
                      onToggleTheme={handleReaderToggleTheme}
                      shouldScrollToTop={readerScrollToTop && tab.id === activeTabId}
                      visible={tab.id === activeTabId}
                    />
                  )}
                </div>
              ))}
            {jsonFormVisible && jsonFormFullScreen && activeTab && (activeTab.language === 'json' || activeTab.language === 'jsonl') && (
              <JsonFormPanel
                tabId={activeTab.id}
                visible={jsonFormVisible}
                fullScreen={true}
                onToggleFullScreen={() => setJsonFormFullScreen(false)}
                onExitFullScreen={() => { setJsonFormFullScreen(false); setJsonFormVisible(false); }}
              />
            )}
          </div>

      {/* Settings Panel overlay */}
      <SettingsPanel visible={settingsVisible} onClose={() => setSettingsVisible(false)} />

          <DiagnosticsPanel
            tabId={activeTabId}
            visible={diagnosticsPanelVisible}
            language={activeTab?.language || null}
          />

          <StatusBar
            activeTab={activeTab}
            theme={theme}
            onEncodingChange={handleEncodingChange}
            onLanguageChange={(lang) => {
              if (activeTab) {
                setTabLanguage(activeTab.id, lang);
              }
            }}
            lineEnding={activeTab?.lineEnding}
            onLineEndingChange={handleLineEndingChange}
            wordWrap={wordWrap}
            onToggleWordWrap={() => {
              const next = !wordWrap;
              useSettingsStore.getState().setWordWrap(next);
            }}
            showWhitespace={showWhitespace}
            onToggleShowWhitespace={() => {
              const next = !showWhitespace;
              useSettingsStore.getState().setShowWhitespace(next);
            }}
            minimapVisible={minimapVisible}
            onToggleMinimap={() => {
              const next = !minimapVisible;
              useSettingsStore.getState().setMinimapVisible(next);
            }}
            diagnosticsPanelVisible={diagnosticsPanelVisible}
            onToggleDiagnosticsPanel={() => setDiagnosticsPanelVisible(!diagnosticsPanelVisible)}
            columnAlignEnabled={columnAlignEnabled}
            onToggleColumnAlign={() => {
              if (activeTab) {
                setTabColumnAlign(activeTab.id, !columnAlignEnabled);
              }
            }}
            columnAlignSupported={columnAlignSupported}
            externalChangeNotice={externalChangeNotice}
          />

          {externalDiff?.open && (
            <ExternalChangeDialog
              open={externalDiff.open}
              fileName={tabs.find((t) => t.id === externalDiff.tabId)?.title ?? ''}
              currentContent={externalDiff.currentContent}
              externalContent={externalDiff.externalContent}
              theme={theme}
              onUseExternal={() => {
                updateEditorContent(externalDiff.tabId, externalDiff.externalContent);
                markTabSaved(externalDiff.tabId);
                setTabEncoding(externalDiff.tabId, externalDiff.externalEncoding as Encoding);
                setTabLineEnding(externalDiff.tabId, detectLineEnding(externalDiff.externalContent));
                setExternalDiff(null);
              }}
              onKeepCurrent={() => {
                setExternalDiff(null);
              }}
              onClose={() => {
                setExternalDiff(null);
              }}
            />
          )}
        </div>
      </div>

    </div>
  );
}

export default App;
