import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { desktopApi } from '../platform/desktop';

interface TitleBarProps {
  title?: string;
  isDark?: boolean;
  onClose?: () => void | Promise<void>;
}

const TitleBar: React.FC<TitleBarProps> = ({ title = 'Text Editor', onClose }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!desktopApi.isDesktop()) return;
    const check = async () => {
      try {
        const max = await desktopApi.windowIsMaximized();
        setIsMaximized(max);
      } catch {
        // ignore
      }
    };
    check();
    const unlisten = desktopApi.onWindowMaximizedChanged(setIsMaximized);
    return () => unlisten();
  }, []);

  const handleMinimize = async () => {
    if (!desktopApi.isDesktop()) return;
    try {
      await desktopApi.windowMinimize();
    } catch (err) {
      console.error('[TitleBar] minimize failed:', err);
    }
  };

  const handleMaximize = async () => {
    if (!desktopApi.isDesktop()) return;
    try {
      const result = await desktopApi.windowToggleMaximize();
      setIsMaximized(result);
    } catch (err) {
      console.error('[TitleBar] maximize failed:', err);
    }
  };

  const handleClose = async () => {
    if (!desktopApi.isDesktop()) return;
    try {
      if (onClose) await onClose();
      else await desktopApi.windowClose();
    } catch (err) {
      console.error('[TitleBar] close failed:', err);
    }
  };

  return (
    <div
      className="relative flex items-center h-8 select-none shrink-0 border-b"
      style={{ WebkitAppRegion: 'drag', backgroundColor: 'var(--te-bg-secondary)', borderBottomColor: 'var(--te-border)' } as React.CSSProperties}
    >
      {/* Left spacer — same width as right controls so title truly centers */}
      <div className="w-[120px] shrink-0" />

      {/* Drag region — title */}
      <div className="flex-1 flex items-center justify-center h-full px-2 overflow-hidden">
        <span className="text-xs font-medium truncate" style={{ color: 'var(--te-text-primary)' }}>
          {title}
        </span>
      </div>

      {/* Window controls */}
      <div className="flex items-center justify-end h-full w-[120px] shrink-0">
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-10 h-full transition-colors hover:opacity-80"
          style={{ WebkitAppRegion: 'no-drag', color: 'var(--te-text-primary)' } as React.CSSProperties}
          title="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-10 h-full transition-colors hover:opacity-80"
          style={{ WebkitAppRegion: 'no-drag', color: 'var(--te-text-primary)' } as React.CSSProperties}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? <Maximize2 size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-10 h-full transition-colors hover:bg-[var(--te-error)]"
          style={{ WebkitAppRegion: 'no-drag', color: 'var(--te-text-primary)' } as React.CSSProperties}
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default React.memo(TitleBar);
