import { useEffect, useRef, useCallback } from 'react';
import type { EditorTab } from '../types';
import { desktopApi } from '../platform/desktop';

export function useFileWatcher(tabs: EditorTab[], onFileChanged?: (path: string) => void | Promise<void>) {
  const watchedPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!desktopApi.isDesktop()) return;

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
        desktopApi.unwatchFile(path).catch(() => {});
        watched.delete(path);
      }
    }

    for (const path of currentPaths) {
      if (!watched.has(path)) {
        desktopApi.watchFile(path).catch(() => {});
        watched.add(path);
      }
    }
  }, [tabs]);

  const onFileChangedRef = useRef(onFileChanged);

  useEffect(() => {
    onFileChangedRef.current = onFileChanged;
  });

  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    const unlisten = desktopApi.onFileChanged(async (changedPath) => {
      if (!watchedPathsRef.current.has(changedPath)) return;
      await onFileChangedRef.current?.(changedPath);
    });
    return () => unlisten();
  }, []);

  const pauseWatch = useCallback(async (path: string) => {
    if (!desktopApi.isDesktop()) return;
    await desktopApi.unwatchFile(path).catch(() => {});
    watchedPathsRef.current.delete(path);
  }, []);

  const resumeWatch = useCallback(async (path: string) => {
    if (!desktopApi.isDesktop()) return;
    await desktopApi.watchFile(path).catch(() => {});
    watchedPathsRef.current.add(path);
  }, []);

  return { pauseWatch, resumeWatch };
}
