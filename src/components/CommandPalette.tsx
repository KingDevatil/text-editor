import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, commands }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.shortcut?.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setQuery('');
        setSelectedIndex(0);
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    queueMicrotask(() => setSelectedIndex(0));
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (filtered.length > 0) setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filtered[selectedIndex]) {
            filtered[selectedIndex].action();
            onClose();
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, selectedIndex, onClose]);

  useEffect(() => {
    if (listRef.current && open) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[560px] max-w-[90vw] rounded-xl shadow-2xl border overflow-hidden bg-[var(--te-bg-tertiary)] border-[var(--te-border)]"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--te-border)]">
          <Search size={18} className="text-[var(--te-text-secondary)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入命令或快捷键..."
            aria-label="搜索命令"
            className="flex-1 bg-[var(--te-bg-primary)] outline-none text-sm text-[var(--te-text-primary)] placeholder-[var(--te-text-secondary)]"
          />
          <button
            onClick={onClose}
            aria-label="关闭命令面板"
            className="p-1 rounded hover:bg-[var(--te-bg-secondary)] text-[var(--te-text-secondary)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-[320px] overflow-auto py-1" role="listbox" aria-label="命令列表">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[var(--te-text-secondary)]">未找到匹配的命令</div>
          ) : (
            filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  index === selectedIndex
                    ? 'bg-[color-mix(in_srgb,var(--te-primary)_10%,transparent)] text-[var(--te-primary)]'
                    : 'text-[var(--te-text-primary)] hover:bg-[var(--te-bg-secondary)]'
                }`}
              >
                <span className="text-gray-400">{cmd.icon}</span>
                <span className="flex-1">{cmd.label}</span>
                {cmd.shortcut && (
                  <kbd className="text-xs px-1.5 py-0.5 rounded bg-[var(--te-bg-secondary)] text-[var(--te-text-secondary)] font-mono">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[var(--te-border)] text-[10px] text-[var(--te-text-secondary)] flex items-center justify-between">
          <span>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
          <span>{filtered.length} 个命令</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CommandPalette);
