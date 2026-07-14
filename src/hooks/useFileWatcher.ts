import { useEffect, useRef, useCallback } from 'react';
import type { EditorTab } from '../types';
import { desktopApi } from '../platform/desktop';
import type { FileChangeEvent } from '../platform/desktop';

async function retryOperation(operation: () => Promise<void>, attempts = 3): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export function useFileWatcher(tabs: EditorTab[], onFileChanged?: (change: FileChangeEvent) => void | Promise<void>) {
  const watchedPathsRef = useRef<Set<string>>(new Set());
  const pausedPathsRef = useRef<Set<string>>(new Set());
  const desiredPathsRef = useRef<Set<string>>(new Set());
  const watchingPathsRef = useRef<Set<string>>(new Set());
  const unwatchingPathsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!desktopApi.isDesktop()) return;

    const currentPaths = new Set(tabs.map((t) => t.filePath).filter(Boolean) as string[]);
    desiredPathsRef.current = currentPaths;
    const watched = watchedPathsRef.current;

    for (const path of pausedPathsRef.current) {
      if (!currentPaths.has(path)) pausedPathsRef.current.delete(path);
    }

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
      if (!currentPaths.has(path) && !unwatchingPathsRef.current.has(path)) {
        unwatchingPathsRef.current.add(path);
        void retryOperation(() => desktopApi.unwatchFile(path))
          .then(async () => {
            watched.delete(path);
            if (desiredPathsRef.current.has(path) && !pausedPathsRef.current.has(path)) {
              await retryOperation(() => desktopApi.watchFile(path));
              watched.add(path);
            }
          })
          .catch((error) => console.error('[FileWatcher] failed to stop watching:', path, error))
          .finally(() => unwatchingPathsRef.current.delete(path));
      }
    }

    for (const path of currentPaths) {
      if (
        !watched.has(path) &&
        !pausedPathsRef.current.has(path) &&
        !watchingPathsRef.current.has(path)
      ) {
        watchingPathsRef.current.add(path);
        void retryOperation(() => desktopApi.watchFile(path))
          .then(async () => {
            if (desiredPathsRef.current.has(path) && !pausedPathsRef.current.has(path)) {
              watched.add(path);
            } else {
              await desktopApi.unwatchFile(path).catch(() => {});
            }
          })
          .catch((error) => console.error('[FileWatcher] failed to watch:', path, error))
          .finally(() => watchingPathsRef.current.delete(path));
      }
    }
  }, [tabs]);

  const onFileChangedRef = useRef(onFileChanged);

  useEffect(() => {
    onFileChangedRef.current = onFileChanged;
  });

  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    const unlisten = desktopApi.onFileChanged(async (change) => {
      if (!watchedPathsRef.current.has(change.path)) return;
      await onFileChangedRef.current?.(change);
    });
    return () => unlisten();
  }, []);

  const pauseWatch = useCallback(async (path: string) => {
    if (!desktopApi.isDesktop()) return;
    pausedPathsRef.current.add(path);
    try {
      await retryOperation(() => desktopApi.unwatchFile(path));
      watchedPathsRef.current.delete(path);
    } catch (error) {
      pausedPathsRef.current.delete(path);
      throw error;
    }
  }, []);

  const resumeWatch = useCallback(async (path: string) => {
    if (!desktopApi.isDesktop()) return;
    await retryOperation(() => desktopApi.watchFile(path));
    watchedPathsRef.current.add(path);
    pausedPathsRef.current.delete(path);
  }, []);

  return { pauseWatch, resumeWatch };
}
