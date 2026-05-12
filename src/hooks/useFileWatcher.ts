import { useEffect, useRef, useCallback } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { EditorTab } from '../types';

export function useFileWatcher(tabs: EditorTab[], onFileChanged?: (path: string) => void | Promise<void>) {
  const watchedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isTauri()) return;

    const currentPaths = new Set(tabs.map((t) => t.filePath).filter(Boolean) as string[]);
    const watched = watchedPathsRef.current;

    // Early exit: skip diff if the path sets are identical
    if (currentPaths.size === watched.size) {
      let allSame = true;
      for (const path of currentPaths) {
        if (!watched.has(path)) {
          allSame = false;
          break;
        }
      }
      if (allSame) return;
    }

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

  const onFileChangedRef = useRef(onFileChanged);
  onFileChangedRef.current = onFileChanged;

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<string>('file-changed', async (event) => {
        const changedPath = event.payload;
        if (!watchedPathsRef.current.has(changedPath)) return;
        await onFileChangedRef.current?.(changedPath);
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
