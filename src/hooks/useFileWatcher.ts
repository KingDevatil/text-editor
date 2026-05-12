import { useEffect, useRef, useCallback } from 'react';
import { invoke, isTauri, listen } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { EditorTab, Encoding } from '../types';
import { useEditorStore } from './useEditorStore';
import { updateEditorContent } from './useEditorStatePool';

export function useFileWatcher(tabs: EditorTab[]) {
  const watchedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isTauri()) return;

    const currentPaths = new Set(tabs.map((t) => t.filePath).filter(Boolean) as string[]);
    const watched = watchedPathsRef.current;

    for (const path of watched) {
      if (!currentPaths.has(path)) {
        invoke('unwatch_file', { path }).catch(() => {});
        watched.delete(path);
      }
    }

    for (const path of currentPaths) {
      if (!watched.has(path)) {
        invoke('watch_file', { path }).catch(() => {});
        watched.add(path);
      }
    }
  }, [tabs]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<string>('file-changed', async (event) => {
        const changedPath = event.payload;
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
          useEditorStore.getState().markTabSaved(stillTab.id);
          useEditorStore.getState().setTabEncoding(stillTab.id, result.encoding as Encoding);
        } catch (err) {
          console.error('Failed to reload changed file:', err);
        }
      });
    };

    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const pauseWatch = useCallback(async (path: string) => {
    if (!isTauri()) return;
    await invoke('unwatch_file', { path }).catch(() => {});
    watchedPathsRef.current.delete(path);
  }, []);

  const resumeWatch = useCallback(async (path: string) => {
    if (!isTauri()) return;
    await invoke('watch_file', { path }).catch(() => {});
    watchedPathsRef.current.add(path);
  }, []);

  return { pauseWatch, resumeWatch };
}
