import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { marked } from 'marked';
import {
  X,
  Type,
  List,
  Moon,
  Sun,
  ChevronUp,
  Maximize2,
  Copy,
  Clipboard,
} from 'lucide-react';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { subscribeContentChange } from '../hooks/useEditorStatePool';
import { useResizableMarkdownTables } from '../hooks/useResizableMarkdownTables';
import { useSettingsStore } from '../hooks/useSettingsStore';
import type { ThemeMode } from '../types';
import { generateHeadingSlugs, slugify } from '../utils/slugify';
import { desktopApi } from '../platform/desktop';

interface MarkdownReaderProps {
  tabId: string;
  theme: ThemeMode;
  onExit: () => void;
  onToggleTheme: () => void;
  shouldScrollToTop?: boolean;
  visible?: boolean;
}



const MarkdownReader: React.FC<MarkdownReaderProps> = React.memo(({
  tabId,
  theme,
  onExit,
  onToggleTheme,
  shouldScrollToTop = false,
  visible = true,
}) => {
  const [content, setContent] = useState('');
  const [readerFontSize, setReaderFontSize] = useState(16);
  const [readerWidth, setReaderWidth] = useState<'default' | 'wide' | 'full'>('default');
  const tocVisible = useSettingsStore((s) => s.readerTocVisible);
  const setReaderTocVisible = useSettingsStore((s) => s.setReaderTocVisible);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstRef = useRef(true);

  // Scroll to top only when newly opened
  useEffect(() => {
    if (shouldScrollToTop) {
      scrollRef.current?.scrollTo({ top: 0 });
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
    return () => {
      unsubscribe();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [tabId, visible]);

  // Close context menu when switching tabs
  useEffect(() => {
    setContextMenu(null);
  }, [tabId]);

  const deferredContent = React.useDeferredValue(content);

  const { html, toc } = useMemo(() => {
    const raw = marked.parse(deferredContent, { async: false }) as string;
    const { htmlWithIds, tocItems } = generateHeadingSlugs(raw);
    return { html: htmlWithIds, toc: tocItems };
  }, [deferredContent]);

  // Scroll tracking
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollTop(el.scrollTop > 300);
  }, []);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el && scrollRef.current) {
      const top = el.offsetTop - 24;
      scrollRef.current.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  // Intercept in-document anchor clicks (e.g. `[text](#heading-id)`)
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) {
      e.preventDefault();
      const rawId = decodeURIComponent(href.slice(1));
      let el = document.getElementById(rawId);
      if (!el) {
        el = document.getElementById(slugify(rawId));
      }
      if (el && scrollRef.current) {
        const top = (el as HTMLElement).offsetTop - 24;
        scrollRef.current.scrollTo({ top, behavior: 'smooth' });
      }
      return;
    }
    e.preventDefault();
    desktopApi.openExternal(href).catch(() => {});
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

  const isDark = theme === 'dark';
  useResizableMarkdownTables(scrollRef, html, visible);

  const bgColor = 'var(--te-bg-primary)';
  const textColor = 'var(--te-text-primary)';
  const proseInvert = isDark ? 'prose-invert' : '';

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
          {/* TOC toggle */}
          <button
            onClick={() => setReaderTocVisible(!tocVisible)}
            className={`flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg transition-all hover:bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)] ${tocVisible ? 'bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)]' : ''}`}
            title="目录"
            style={{ color: textColor }}
          >
            <List size={16} />
          </button>

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

          {/* Font size */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setReaderFontSize((s) => Math.max(12, s - 1))}
              className="px-2 py-1.5 rounded-lg transition-all hover:bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)]"
              title="减小字号"
              style={{ color: textColor }}
            >
              <Type size={14} />
            </button>
            <span className="text-xs w-6 text-center tabular-nums" style={{ color: textColor }}>
              {readerFontSize}
            </span>
            <button
              onClick={() => setReaderFontSize((s) => Math.min(24, s + 1))}
              className="px-2 py-1.5 rounded-lg transition-all hover:bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)]"
              title="增大字号"
              style={{ color: textColor }}
            >
              <Maximize2 size={14} />
            </button>
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

      {/* TOC sidebar overlay */}
      {tocVisible && toc.length > 0 && (
        <div className="absolute left-0 top-12 bottom-0 w-64 z-40 border-r overflow-auto"
          style={{ backgroundColor: bgColor, borderColor: 'color-mix(in srgb, var(--te-border) 30%, transparent)' }}
        >
          <div className="p-4">
            <h3 className="text-sm font-semibold mb-3" style={{ color: textColor }}>目录</h3>
            <nav className="space-y-1">
              {toc.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToHeading(item.id)}
                  className="block w-full text-left text-sm rounded-md px-2 py-1 transition-colors hover:bg-[color-mix(in_srgb,var(--te-text-primary)_10%,transparent)] truncate"
                  style={{
                    color: textColor,
                    paddingLeft: `${(item.level - 1) * 12 + 8}px`,
                    opacity: item.level === 1 ? 1 : 0.75,
                    fontWeight: item.level === 1 ? 500 : 400,
                  }}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-auto ${tocVisible && toc.length > 0 ? 'pl-64' : ''}`}
        onScroll={handleScroll}
        onClick={handleContentClick}
        onContextMenu={(e) => {
          e.preventDefault();
          const selection = window.getSelection()?.toString() || '';
          const items: ContextMenuItem[] = [
            {
              id: 'copy',
              label: '复制',
              icon: <Copy size={14} />,
              disabled: !selection,
              action: () => navigator.clipboard.writeText(selection),
            },
            {
              id: 'select-all',
              label: '全选',
              icon: <Clipboard size={14} />,
              action: () => {
                const range = document.createRange();
                const proseEl = scrollRef.current?.querySelector('.reader-prose');
                if (proseEl) {
                  range.selectNodeContents(proseEl);
                  const sel = window.getSelection();
                  sel?.removeAllRanges();
                  sel?.addRange(range);
                }
              },
            },
          ];
          setContextMenu({ x: e.clientX, y: e.clientY, items });
        }}
      >
        <div className={`mx-auto px-6 py-10 ${readerWidth === 'default' ? 'max-w-3xl' : readerWidth === 'wide' ? 'max-w-5xl' : 'max-w-none'}`}>
          <div
            className={`prose ${proseInvert} max-w-none reader-prose`}
            style={{
              color: textColor,
              fontSize: `${readerFontSize}px`,
              lineHeight: '1.8',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
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

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});

MarkdownReader.displayName = 'MarkdownReader';

export default MarkdownReader;
