import { useState, useCallback } from 'react';
import { Undo, Redo, Scissors, Copy, ClipboardPaste, AlignLeft, Braces, Map, WrapText, Space, GitCompare, X, FileMinus, Crosshair, FolderOpen } from 'lucide-react';
import { undo, redo, selectAll } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { writeClipboard, readClipboard } from '../utils/clipboard';
import { formatDocument } from '../utils/cmCommands';
import { goToDefinition } from '../utils/cmCommands';
import { useEditorStore } from './useEditorStore';
import { useSettingsStore } from './useSettingsStore';
import type { ContextMenuItem } from '../components/ContextMenu';

export function useEditorContextMenu(
  viewRef: React.MutableRefObject<EditorView | null>,
  language: string,
  tabId: string,
  canFormat: boolean
) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  const buildMenuItems = useCallback((): ContextMenuItem[] => {
    const view = viewRef.current;
    if (!view) return [];

    const { state } = view;
    const hasSelection = state.selection.main.from !== state.selection.main.to;
    const canUndo = undo({ state, dispatch: () => {} });
    const canRedo = redo({ state, dispatch: () => {} });

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

    const settings = useSettingsStore.getState();
    items.push(
      { id: 'divider-view', label: '', icon: null, divider: true, action: () => {} },
      {
        id: 'toggle-minimap',
        label: settings.minimapVisible ? '隐藏缩略图' : '显示缩略图',
        icon: <Map size={14} />,
        action: () => useSettingsStore.getState().setMinimapVisible(!settings.minimapVisible),
      },
      {
        id: 'toggle-wordwrap',
        label: settings.wordWrap ? '关闭自动换行' : '开启自动换行',
        icon: <WrapText size={14} />,
        action: () => useSettingsStore.getState().setWordWrap(!settings.wordWrap),
      },
      {
        id: 'toggle-whitespace',
        label: settings.showWhitespace ? '隐藏空白字符' : '显示空白字符',
        icon: <Space size={14} />,
        action: () => useSettingsStore.getState().setShowWhitespace(!settings.showWhitespace),
      }
    );

    return items;
  }, [language, canFormat, tabId, viewRef]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    try {
      const items = buildMenuItems();
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    } catch (err) {
      console.error('[ContextMenu] 构建菜单失败:', err);
    }
  }, [buildMenuItems]);

  const closeMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, setContextMenu: closeMenu, handleContextMenu };
}
