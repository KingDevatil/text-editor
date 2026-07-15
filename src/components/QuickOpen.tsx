import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FileText, Clock, X } from 'lucide-react';
import type { MruItem } from '../hooks/useMru';

interface QuickOpenProps {
  open: boolean;
  onClose: () => void;
  mruItems: MruItem[];
  openTabs: { id: string; title: string; filePath?: string }[];
  onOpenFile: (path: string) => void;
  onActivateTab: (tabId: string) => void;
}

const QuickOpen: React.FC<QuickOpenProps> = ({
  open,
  onClose,
  mruItems,
  openTabs,
  onOpenFile,
  onActivateTab,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build combined list: open tabs first, then MRU items not already open
  const results = useMemo(() => {
    const openPaths = new Set(openTabs.map((t) => t.filePath).filter(Boolean));
    const tabs = openTabs.map((t) => ({
      type: 'tab' as const,
      id: t.id,
      title: t.title,
      path: t.filePath || '',
    }));
    const mru = mruItems
      .filter((i) => !openPaths.has(i.path))
      .map((i) => ({
        type: 'mru' as const,
        id: i.path,
        title: i.title,
        path: i.path,
      }));
    const combined = [...tabs, ...mru];

    if (!query.trim()) return combined;

    const q = query.toLowerCase();
    return combined.filter(
      (item) =>
        item.title.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
    );
  }, [query, mruItems, openTabs]);

  useEffect(() => {
    queueMicrotask(() => setSelectedIndex(0));
  }, [query, results.length]);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setQuery('');
        setSelectedIndex(0);
      });
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleSelect = useCallback(
    (item: (typeof results)[number]) => {
      if (item.type === 'tab') {
        onActivateTab(item.id);
      } else if (item.path) {
        onOpenFile(item.path);
      }
      onClose();
    },
    [onActivateTab, onOpenFile, onClose]
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (results.length > 0) setSelectedIndex((i) => (i + 1) % results.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (results.length > 0) setSelectedIndex((i) => (i - 1 + results.length) % results.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, results, selectedIndex, handleSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 bg-black/20">
      <div
        className="w-full max-w-xl rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--te-bg-primary)', border: '1px solid var(--te-border)' }}
        role="dialog"
        aria-modal="true"
        aria-label="快速打开"
      >
        <div className="flex items-center px-3 py-2 border-b" style={{ borderColor: 'var(--te-border)' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入文件名或路径快速打开…"
            aria-label="搜索文件"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--te-text-primary)' }}
          />
          <button onClick={onClose} aria-label="关闭快速打开" className="p-1 rounded hover:opacity-70" style={{ color: 'var(--te-text-secondary)' }}>
            <X size={16} />
          </button>
        </div>
        <div ref={listRef} className="max-h-80 overflow-auto py-1" role="listbox" aria-label="文件列表">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--te-text-secondary)' }}>
              没有匹配的文件
            </div>
          ) : (
            results.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  data-selected={isSelected}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors"
                  style={{
                    backgroundColor: isSelected ? 'color-mix(in srgb, var(--te-primary) 15%, transparent)' : 'transparent',
                    color: 'var(--te-text-primary)',
                  }}
                >
                  {item.type === 'tab' ? <FileText size={14} /> : <Clock size={14} />}
                  <span className="flex-1 truncate">{item.title}</span>
                  {item.path && (
                    <span className="text-xs truncate max-w-[40%]" style={{ color: 'var(--te-text-secondary)' }}>
                      {item.path}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 px-3 py-1.5 text-xs border-t" style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-secondary)' }}>
          <span>↑↓ 选择</span>
          <span>Enter 打开</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(QuickOpen);
