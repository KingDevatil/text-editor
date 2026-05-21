import { useCallback, useState, useEffect } from 'react';

const MRU_KEY = 'te2-mru';
const MRU_MAX = 50;

export interface MruItem {
  path: string;
  title: string;
  timestamp: number;
}

function loadMru(): MruItem[] {
  try {
    const raw = localStorage.getItem(MRU_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveMru(items: MruItem[]): void {
  try {
    localStorage.setItem(MRU_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function addToMru(path: string, title: string): void {
  const items = loadMru();
  const filtered = items.filter((i) => i.path !== path);
  filtered.unshift({ path, title, timestamp: Date.now() });
  if (filtered.length > MRU_MAX) {
    filtered.length = MRU_MAX;
  }
  saveMru(filtered);
}

export function removeFromMru(path: string): void {
  const items = loadMru().filter((i) => i.path !== path);
  saveMru(items);
}

export function getMruItems(): MruItem[] {
  return loadMru();
}

export function useMru() {
  const [items, setItems] = useState<MruItem[]>(loadMru);

  const refresh = useCallback(() => {
    setItems(loadMru());
  }, []);

  const add = useCallback((path: string, title: string) => {
    addToMru(path, title);
    refresh();
  }, [refresh]);

  const remove = useCallback((path: string) => {
    removeFromMru(path);
    refresh();
  }, [refresh]);

  // Refresh on mount (in case another window/instance updated MRU)
  useEffect(() => {
    const id = requestAnimationFrame(refresh);
    return () => cancelAnimationFrame(id);
  }, [refresh]);

  return { items, add, remove, refresh };
}
