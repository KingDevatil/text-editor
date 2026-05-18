import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  divider?: boolean;
  action: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or scroll
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('wheel', handleScroll, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('wheel', handleScroll);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport
  const menuWidth = 200;
  const menuHeight = items.length * 36 + 16;
  const posX = Math.min(x, window.innerWidth - menuWidth - 8);
  const posY = Math.min(y, window.innerHeight - menuHeight - 8);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 py-1.5 min-w-[180px] rounded-lg border border-[var(--te-border)] shadow-lg bg-[var(--te-bg-tertiary)] animate-in fade-in zoom-in-95 duration-100"
      style={{ left: posX, top: posY }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${index}`}
              className="my-1 border-t border-[var(--te-border)]"
            />
          );
        }
        return (
          <button
            key={item.id}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors
              ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed text-[var(--te-text-secondary)]'
                  : 'text-[var(--te-text-primary)] hover:bg-[var(--te-bg-secondary)] cursor-pointer'
              }`}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            disabled={item.disabled}
          >
            <span className="flex-shrink-0 text-[var(--te-text-secondary)]">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-[var(--te-text-secondary)] ml-3">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
};

export default React.memo(ContextMenu);
