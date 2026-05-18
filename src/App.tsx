import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { FilePlus, FolderOpen, Save, Search, Braces, PanelLeft, Sun, Moon, WrapText, Space, BookOpen, Columns2, GitCompare, X, Eye, Table } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, confirm, message } from '@tauri-apps/plugin-dialog';
import { useEditorStore } from './hooks/useEditorStore';
import { useFileOpener } from './hooks/useFileOpener';
import { useFileWatcher } from './hooks/useFileWatcher';
import { getEditorContent, updateEditorContent, getActiveView } from './hooks/useEditorStatePool';
import { formatDocument, goToDefinition } from './utils/cmCommands';
import { perf } from './utils/perf';
import type { Encoding } from './types';
import { resolveThemeColors } from './utils/themeResolver';
import { injectThemeVars } from './utils/themeInjector';
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
import CommandPalette from './components/CommandPalette';
import TitleBar from './components/TitleBar';
import DiagnosticsPanel from './components/DiagnosticsPanel';

function App() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activeGroup1TabId = useEditorStore((s) => s.activeGroup1TabId);
  const activeGroup2TabId = useEditorStore((s) => s.activeGroup2TabId);
  const theme = useEditorStore((s) => s.theme);
  const lightCustomColors = useEditorStore((s) => s.lightCustomColors);
  const darkCustomColors = useEditorStore((s) => s.darkCustomColors);
  const customColors = useEditorStore((s) => s.customColors);
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible);
  const findReplaceVisible = useEditorStore((s) => s.findReplaceVisible);
  const unicodeHighlight = useEditorStore((s) => s.unicodeHighlight);
  const fontSize = useEditorStore((s) => s.fontSize);

  // Refs for keyboard shortcuts — always point to latest callbacks
  const handleNewFileRef = useRef<(() => void) | null>(null);
  const handleOpenFileRef = useRef<(() => void) | null>(null);
  const handleSaveFileRef = useRef<(() => void) | null>(null);
  const handleFormatRef = useRef<(() => void) | null>(null);
  const findReplaceVisibleRef = useRef(findReplaceVisible);
  const columnAlignEnabledRef = useRef(false);
  const columnAlignSupportedRef = useRef(false);

  // Keep all callback refs up-to-date outside of render phase
  useEffect(() => {
    findReplaceVisibleRef.current = findReplaceVisible;
  });
  useEffect(() => {
    columnAlignEnabledRef.current = columnAlignEnabled;
  });
  useEffect(() => {
    columnAlignSupportedRef.current = columnAlignSupported;
  });
  const previewVisible = useEditorStore((s) => s.previewVisible);
  const splitMode = useEditorStore((s) => s.splitMode);
  const projectPath = useEditorStore((s) => s.projectPath);
  const largeFileOptimize = useEditorStore((s) => s.largeFileOptimize);
  const wordWrap = useEditorStore((s) => s.wordWrap);
  const showWhitespace = useEditorStore((s) => s.showWhitespace);
  const scrollPastEnd = useEditorStore((s) => s.scrollPastEnd);
  const minimapVisible = useEditorStore((s) => s.minimapVisible);
  const diffMode = useEditorStore((s) => s.diffMode);
  const diffLeftTabId = useEditorStore((s) => s.diffLeftTabId);
  const diffRightTabId = useEditorStore((s) => s.diffRightTabId);
  const readMode = useEditorStore((s) => s.readMode);
  const diagnosticsPanelVisible = useEditorStore((s) => s.diagnosticsPanelVisible);
  const setDiagnosticsPanelVisible = useEditorStore((s) => s.setDiagnosticsPanelVisible);
  const columnAlignEnabled = useEditorStore((s) => s.columnAlignEnabled);
  const setColumnAlignEnabled = useEditorStore((s) => s.setColumnAlignEnabled);
  const columnAlignSupported = useEditorStore((s) => s.columnAlignSupported);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || null);

  const setActiveTabId = useEditorStore((s) => s.setActiveTabId);
  const setActiveGroup1TabId = useEditorStore((s) => s.setActiveGroup1TabId);
  const setActiveGroup2TabId = useEditorStore((s) => s.setActiveGroup2TabId);
  const setTheme = useEditorStore((s) => s.setTheme);
  const setSidebarVisible = useEditorStore((s) => s.setSidebarVisible);
  const setFindReplaceVisible = useEditorStore((s) => s.setFindReplaceVisible);
  const setPreviewVisible = useEditorStore((s) => s.setPreviewVisible);
  const setSplitMode = useEditorStore((s) => s.setSplitMode);
  const setProjectPath = useEditorStore((s) => s.setProjectPath);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const setTabEncoding = useEditorStore((s) => s.setTabEncoding);
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);
  const createTab = useEditorStore((s) => s.createTab);
  const markTabDirty = useEditorStore((s) => s.markTabDirty);
  const closeTab = useEditorStore((s) => s.closeTab);
  const closeTabs = useEditorStore((s) => s.closeTabs);
  const markTabSaved = useEditorStore((s) => s.markTabSaved);
  const renameTab = useEditorStore((s) => s.renameTab);
  const moveTabToGroup = useEditorStore((s) => s.moveTabToGroup);
  const reorderTab = useEditorStore((s) => s.reorderTab);
  const setReadMode = useEditorStore((s) => s.setReadMode);

  const openFile = useFileOpener();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [readerScrollToTop, setReaderScrollToTop] = useState(false);
  const SIDEBAR_WIDTH = 220;
  const handleFileChanged = useCallback(async (changedPath: string) => {
    const tab = useEditorStore.getState().tabs.find((t) => t.filePath === changedPath);
    if (!tab) return;

    if (tab.isDirty) {
      const ok = await confirm(
        `"${tab.title}" 已被外部程序修改。是否重新加载并覆盖当前未保存的更改？`,
        { title: '文件已更改', kind: 'warning' }
      );
      if (!ok) return;
    }

    const stillTab = useEditorStore.getState().tabs.find((t) => t.filePath === changedPath);
    if (!stillTab) return;

    try {
      const result = await invoke<{ text: string; encoding: string }>('read_file_auto_detect', {
        path: changedPath,
      });
      updateEditorContent(stillTab.id, result.text);
      markTabSaved(stillTab.id);
      setTabEncoding(stillTab.id, result.encoding as Encoding);
    } catch (err) {
      console.error('Failed to reload changed file:', err);
    }
  }, [markTabSaved, setTabEncoding]);

  const { pauseWatch, resumeWatch } = useFileWatcher(tabs, handleFileChanged);

  // Auto-disable split when less than 2 tabs
  useEffect(() => {
    if (splitMode && tabs.length < 2) {
      setSplitMode(false);
    }
  }, [tabs.length, splitMode, setSplitMode]);

  // Show window after paint completes to avoid blank screen
  useEffect(() => {
    if (!isTauri()) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        getCurrentWindow().show().catch(() => {});
      });
    });
  }, []);

  // Listen for file open events from backend (single instance / file association)
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<string>('open-file', (event) => {
        openFile(event.payload);
      });
    };

    setupListener();

    invoke<string[]>('get_pending_files')
      .then((files) => {
        for (const filePath of files) {
          openFile(filePath);
        }
      })
      .catch((err) => {
        console.error('Failed to get pending files:', err);
      });

    return () => {
      if (unlisten) unlisten();
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
      // Read mode toggle: Ctrl+Shift+V
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        const state = useEditorStore.getState();
        if (state.readMode) {
          setReadMode(false);
        } else {
          const tab = state.tabs.find((t) => t.id === state.activeTabId);
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
        setColumnAlignEnabled(!columnAlignEnabledRef.current);
      }
      // Go to definition shortcut (only intercept in Tauri; let F12 open DevTools in browser)
      if (e.key === 'F12' && isTauri()) {
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
  }, [setFindReplaceVisible, setReadMode]);

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
    if (isTauri()) {
      try {
        const selected = await open({ multiple: true });
        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected];
          for (const filePath of paths) {
            await openFile(filePath);
          }
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
            if (isTauri() && filePath) {
              await openFile(filePath);
            } else {
              const text = await file.text();
              const currentTabs = useEditorStore.getState().tabs;
              const existing = currentTabs.find((t) => t.title === fileName);
              if (existing) {
                setActiveTabId(existing.id);
                updateEditorContent(existing.id, text);
              } else {
                createTab(fileName, undefined, undefined, 1, 'UTF-8', text);
              }
            }
          } catch (err) {
            console.error('Failed to read file:', fileName, err);
            if (isTauri() && filePath) {
              console.warn(`[OpenFile] 无法读取文件: ${fileName}`);
            }
          }
        })());
      }

      await Promise.all(filePromises);
      e.target.value = '';
    },
    [openFile, setActiveTabId, createTab]
  );

  const handleSaveFile = useCallback(async () => {
    if (!activeTab) return;

    try {
      if (isTauri() && activeTab.filePath) {
        const content = getEditorContent(activeTab.id);
        await pauseWatch(activeTab.filePath);
        await invoke('write_file_with_encoding', {
          path: activeTab.filePath,
          content,
          encoding: activeTab.encoding,
        });
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
        await writable.write(getEditorContent(activeTab.id));
        await writable.close();
        markTabSaved(activeTab.id);
        renameTab(activeTab.id, handle.name);
      } else {
        const blob = new Blob([getEditorContent(activeTab.id)], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeTab.title;
        a.click();
        URL.revokeObjectURL(url);
        markTabSaved(activeTab.id);
      }
    } catch (err) {
      console.log('Save cancelled or failed', err);
    }
  }, [activeTab, markTabSaved, renameTab, pauseWatch, resumeWatch]);
  useEffect(() => {
    handleSaveFileRef.current = handleSaveFile;
  });

  const handleOpenFolder = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const selected = await open({ directory: true });
      if (selected) {
        const path = Array.isArray(selected) ? selected[0] : selected;
        setProjectPath(path);
      }
    } catch (err) {
      console.error('[OpenFolder] failed:', err);
    }
  }, [setProjectPath]);

  const handleSidebarOpenFile = useCallback(
    async (filePath: string) => {
      if (!isTauri()) return;
      const existing = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
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
    closeTab(id);
  }, [closeTab]);

  const handleCloseTabs = useCallback((ids: string[]) => {
    closeTabs(ids);
  }, [closeTabs]);

  const handleRenameTab = useCallback(async (tabId: string, newTitle: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.filePath && isTauri()) {
      try {
        const { dirname, join } = await import('@tauri-apps/api/path');
        const dir = await dirname(tab.filePath);
        const newPath = await join(dir, newTitle);
        await invoke('rename_file', { oldPath: tab.filePath, newPath });
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

  const handleEncodingChange = useCallback(
    async (enc: Encoding) => {
      if (!activeTab) return;
      const tabId = activeTab.id;
      const filePath = activeTab.filePath;
      console.log('[EncodingChange] switching encoding:', enc, 'tabId:', tabId, 'filePath:', filePath);
      setTabEncoding(tabId, enc);

      if (isTauri() && filePath) {
        try {
          const text = await invoke<string>('read_file_with_encoding', {
            path: filePath,
            encoding: enc,
          });
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
    if (!isTauri()) return;

    let processing = false;
    const p1 = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        if (processing) return;
        processing = true;
        setTimeout(() => { processing = false; }, 500);
        for (const filePath of event.payload.paths) {
          invoke<{ text: string; encoding: string }>('read_file_auto_detect', { path: filePath })
            .then((result) => {
              openFile(filePath, { text: result.text, encoding: result.encoding });
            })
            .catch((err) => {
              console.error('Failed to read dropped file:', filePath, err);
            });
        }
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
      if (getStore().tabs.some((t) => t.isDirty)) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    let tauriUnlisten: (() => void) | undefined;
    if (isTauri()) {
      getCurrentWindow().onCloseRequested((event) => {
        const dirtyTabs = getStore().tabs.filter((t) => t.isDirty);
        if (dirtyTabs.length > 0) {
          const names = dirtyTabs.map((t) => `"${t.title}"`).join(', ');
          event.preventDefault();
          confirm(`${names} 有未保存的更改，确定要退出吗？`, { title: '未保存的更改' }).then((ok) => {
            if (ok) {
              getCurrentWindow().destroy();
            }
          }).catch(() => {});
        }
      }).then((unlisten) => { tauriUnlisten = unlisten; }).catch(() => {});
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (tauriUnlisten) tauriUnlisten();
    };
  }, []);

  // Browser fallback: HTML5 Drag and Drop
  useEffect(() => {
    if (isTauri()) return;

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
          if (existing) {
            setActiveTabId(existing.id);
            updateEditorContent(existing.id, text);
          } else {
            createTab(fileName, undefined, undefined, 1, 'UTF-8', text);
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
  }, [setActiveTabId, createTab]);

  const canFormat = !!activeTab;

  const handleFormat = useCallback(async () => {
    if (!activeTab) {
      if (isTauri()) await message('没有打开的文件，请先打开或新建一个文件。', { title: '格式化' });
      else alert('没有打开的文件，请先打开或新建一个文件。');
      return;
    }
    const view = getActiveView(activeTab.id);
    if (!view) {
      if (isTauri()) await message('无法获取编辑器实例，请尝试切换标签页后重试。', { title: '格式化' });
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
      if (isTauri()) await message(msg, { title: '格式化' });
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
    const state = useEditorStore.getState();
    if (state.readMode) {
      setReadMode(false);
    } else {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      if (tab?.language === 'markdown' || tab?.language === 'html') {
        setReadMode(true);
      } else {
        console.warn('[ReadMode] 仅对 Markdown 和 HTML 文件可用');
      }
    }
  }, [setReadMode]);

  const handleReaderExit = useCallback(() => setReadMode(false), [setReadMode]);
  const handleReaderToggleTheme = useCallback(() => handleCycleTheme(), [handleCycleTheme]);

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
    { id: 'format', label: '格式化文档', shortcut: 'Shift+Alt+F', icon: <Braces size={16} />, action: handleFormat },
    { id: 'sidebar', label: sidebarVisible ? '隐藏侧边栏' : '显示侧边栏', icon: <PanelLeft size={16} />, action: () => setSidebarVisible(!sidebarVisible) },
    { id: 'theme', label: `切换主题 (${theme})`, icon: isDark ? <Sun size={16} /> : <Moon size={16} />, action: handleCycleTheme },
    { id: 'wordwrap', label: wordWrap ? '关闭自动换行' : '开启自动换行', icon: <WrapText size={16} />, action: () => useEditorStore.getState().setWordWrap(!wordWrap) },
    { id: 'whitespace', label: showWhitespace ? '隐藏空白字符' : '显示空白字符', icon: <Space size={16} />, action: () => useEditorStore.getState().setShowWhitespace(!showWhitespace) },
    { id: 'preview', label: previewVisible ? '关闭预览' : '开启预览', icon: <BookOpen size={16} />, action: () => setPreviewVisible(!previewVisible) },
    { id: 'readmode', label: readMode ? '退出阅读模式' : '阅读模式', shortcut: 'Ctrl+Shift+V', icon: <Eye size={16} />, action: handleToggleReadMode },
    { id: 'split', label: splitMode ? '关闭分屏' : '开启分屏', icon: <Columns2 size={16} />, action: handleToggleSplit },
    { id: 'diff', label: diffMode ? '退出对比' : '对比文件', icon: diffMode ? <X size={16} /> : <GitCompare size={16} />, action: handleToggleDiff },
    ...(columnAlignSupported ? [{
      id: 'columnAlign',
      label: columnAlignEnabled ? '关闭列对齐' : '开启列对齐',
      shortcut: 'Ctrl+Shift+T',
      icon: <Table size={16} />,
      action: () => setColumnAlignEnabled(!columnAlignEnabled),
    }] : []),
    ...(activeTab?.filePath ? [{
      id: 'reveal',
      label: '在文件夹中显示',
      icon: <FolderOpen size={16} />,
      action: async () => {
        try {
          await invoke('reveal_in_folder', { path: activeTab.filePath });
        } catch (err) {
          console.error('[Reveal] 打开文件夹失败:', err);
        }
      },
    }] : []),
  ], [handleNewFile, handleOpenFile, handleSaveFile, handleFormat, handleCycleTheme, handleToggleSplit, handleToggleDiff, handleToggleReadMode, findReplaceVisible, setFindReplaceVisible, sidebarVisible, setSidebarVisible, isDark, wordWrap, showWhitespace, previewVisible, setPreviewVisible, splitMode, diffMode, readMode, activeTab, theme, columnAlignEnabled, setColumnAlignEnabled, columnAlignSupported]);

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
        canFormat={canFormat}
        canPreview={canPreview}
        previewActive={previewVisible}
        canSplit={canSplit}
        splitActive={splitMode}
        canReadMode={!!activeTab && (activeTab.language === 'markdown' || activeTab.language === 'html')}
        readModeActive={readMode}
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
          />
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
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
                      columnAlignEnabled={columnAlignSupported && columnAlignEnabled}
                    />
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
                                columnAlignEnabled={columnAlignSupported && columnAlignEnabled}
                              />
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
            wordWrap={wordWrap}
            onToggleWordWrap={() => {
              const next = !wordWrap;
              useEditorStore.getState().setWordWrap(next);
            }}
            showWhitespace={showWhitespace}
            onToggleShowWhitespace={() => {
              const next = !showWhitespace;
              useEditorStore.getState().setShowWhitespace(next);
            }}
            minimapVisible={minimapVisible}
            onToggleMinimap={() => {
              const next = !minimapVisible;
              useEditorStore.getState().setMinimapVisible(next);
            }}
            diagnosticsPanelVisible={diagnosticsPanelVisible}
            onToggleDiagnosticsPanel={() => setDiagnosticsPanelVisible(!diagnosticsPanelVisible)}
            columnAlignEnabled={columnAlignEnabled}
            onToggleColumnAlign={() => setColumnAlignEnabled(!columnAlignEnabled)}
            columnAlignSupported={columnAlignSupported}
          />
        </div>
      </div>

    </div>
  );
}

export default App;
