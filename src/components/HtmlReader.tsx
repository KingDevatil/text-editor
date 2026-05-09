import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Moon, Sun, ChevronUp } from 'lucide-react';
import { getEditorContent } from '../hooks/useEditorStatePool';
import type { ThemeMode } from '../types';
import { prepareHtmlSrcDoc } from '../utils/htmlPreview';

interface HtmlReaderProps {
  tabId: string;
  theme: ThemeMode;
  onExit: () => void;
  onToggleTheme: () => void;
}

const HtmlReader: React.FC<HtmlReaderProps> = React.memo(({
  tabId,
  theme,
  onExit,
  onToggleTheme,
}) => {
  const [content, setContent] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastContentRef = useRef('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Poll content changes
  useEffect(() => {
    const poll = () => {
      const current = getEditorContent(tabId);
      if (current !== lastContentRef.current) {
        lastContentRef.current = current;
        setContent(current);
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [tabId]);

  const isDark = theme === 'dark';
  const srcDoc = useMemo(() => prepareHtmlSrcDoc(content, isDark), [content, isDark]);

  // Scroll tracking inside iframe for back-to-top button
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cleanup: (() => void) | undefined;

    const setup = () => {
      const win = iframe.contentWindow;
      if (!win) return;

      const onScroll = () => setShowScrollTop(win.scrollY > 300);
      win.addEventListener('scroll', onScroll);
      cleanup = () => win.removeEventListener('scroll', onScroll);
    };

    if (iframe.contentDocument?.readyState === 'complete') {
      setup();
    } else {
      iframe.addEventListener('load', setup, { once: true });
    }

    return () => {
      iframe.removeEventListener('load', setup);
      cleanup?.();
    };
  }, [srcDoc]);

  const scrollToTop = useCallback(() => {
    iframeRef.current?.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Keyboard: ESC to exit
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onExit]);

  const bgColor = 'var(--te-bg-primary)';
  const textColor = 'var(--te-text-primary)';

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col"
      style={{ backgroundColor: bgColor }}
    >
      {/* Floating top bar */}
      <div className="flex items-center justify-between px-4 h-12 shrink-0 border-b"
        style={{ backgroundColor: bgColor, borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-all hover:bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)]"
            style={{ color: 'var(--te-text-secondary)' }}
            title="退出阅读模式 (ESC)"
          >
            <X size={16} />
            <span className="hidden sm:inline">退出阅读</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Theme */}
          <button
            onClick={onToggleTheme}
            className="px-2 py-1.5 rounded-lg transition-all hover:bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)]"
            title="切换主题"
            style={{ color: textColor }}
          >
            {isDark ? <Sun size={16} /> : theme === 'custom' ? <span className="text-xs">Custom</span> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <div className="w-full h-full min-h-[100vh]">
          <iframe
            ref={iframeRef}
            title="HTML Reader"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="w-full h-full border-none"
            style={{
              backgroundColor: bgColor,
              minHeight: '100vh',
            }}
          />
        </div>
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="absolute bottom-6 right-6 p-2 rounded-full shadow-lg transition-all hover:scale-110 z-40"
          style={{
            backgroundColor: 'var(--te-bg-tertiary)',
            color: 'var(--te-text-primary)',
            border: '1px solid color-mix(in srgb, var(--te-border) 10%, transparent)',
          }}
          title="回到顶部"
        >
          <ChevronUp size={20} />
        </button>
      )}
    </div>
  );
});

HtmlReader.displayName = 'HtmlReader';

export default HtmlReader;
