import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { X, Moon, Sun, ChevronUp } from 'lucide-react';
import { subscribeContentChange } from '../hooks/useEditorStatePool';
import type { ThemeMode } from '../types';
import { prepareHtmlSrcDoc } from '../utils/htmlPreview';

interface HtmlReaderProps {
  tabId: string;
  theme: ThemeMode;
  onExit: () => void;
  onToggleTheme: () => void;
  shouldScrollToTop?: boolean;
  visible?: boolean;
}

const HtmlReader: React.FC<HtmlReaderProps> = React.memo(({
  tabId,
  theme,
  onExit,
  onToggleTheme,
  shouldScrollToTop = false,
  visible = true,
}) => {
  const [content, setContent] = useState('');
  const [readerWidth, setReaderWidth] = useState<'default' | 'wide' | 'full'>('default');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savedScrollYRef = useRef(0);
  const isFirstRef = useRef(true);

  // Scroll to top only when newly opened; otherwise restore previous position
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (shouldScrollToTop) {
      win.scrollTo({ top: 0 });
    } else if (savedScrollYRef.current > 0) {
      win.scrollTo({ top: savedScrollYRef.current });
    }
  }, [tabId, shouldScrollToTop]);

  // Subscribe to content changes via event-driven pub/sub with 300ms debounce
  useEffect(() => {
    if (!visible) return;
    isFirstRef.current = true;
    const unsubscribe = subscribeContentChange(tabId, (newContent) => {
      if (isFirstRef.current) {
        isFirstRef.current = false;
        setContent(newContent);
        return;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        setContent(newContent);
      }, 300);
    });
    const iframeForCleanup = iframeRef.current;
    return () => {
      unsubscribe();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      // Save iframe scroll position before unmount/tab switch
      savedScrollYRef.current = iframeForCleanup?.contentWindow?.scrollY || 0;
    };
  }, [tabId, visible]);

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

  // Keyboard: ESC to exit (only when this instance is visible)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onExit, visible]);

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
          {/* Page width toggle */}
          <div className="flex items-center gap-0.5 px-1 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--te-bg-tertiary) 50%, transparent)' }}>
            {([
              { key: 'default', label: '默认宽度', w: 14 },
              { key: 'wide', label: '较宽宽度', w: 18 },
              { key: 'full', label: '全宽', w: 22 },
            ] as const).map((item) => (
              <button
                key={item.key}
                onClick={() => setReaderWidth(item.key)}
                className={`px-1.5 py-1.5 rounded-md transition-all ${readerWidth === item.key ? 'bg-[color-mix(in_srgb,var(--te-primary)_15%,transparent)]' : 'hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]'}`}
                title={item.label}
                style={{ color: readerWidth === item.key ? 'var(--te-primary)' : textColor }}
              >
                <div
                  className="h-2.5 rounded-sm border"
                  style={{
                    width: item.w,
                    borderColor: readerWidth === item.key ? 'var(--te-primary)' : 'currentColor',
                    opacity: readerWidth === item.key ? 1 : 0.5,
                  }}
                />
              </button>
            ))}
          </div>

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
        <div className={`mx-auto h-full min-h-[100vh] ${readerWidth === 'default' ? 'max-w-3xl' : readerWidth === 'wide' ? 'max-w-5xl' : 'max-w-none'}`}>
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
