import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { marked } from 'marked';
import { Copy, Clipboard } from 'lucide-react';
import { subscribeContentChange } from '../hooks/useEditorStatePool';
import { generateHeadingSlugs, slugify } from '../utils/slugify';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { desktopApi } from '../platform/desktop';

const LARGE_PREVIEW_THRESHOLD = 1024 * 1024;

interface MarkdownPreviewProps {
  tabId: string;
  theme: string;
  visible?: boolean;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = React.memo(({ tabId, theme, visible = true }) => {
  const [content, setContent] = useState('');
  const [allowLargeRender, setAllowLargeRender] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRef = useRef(true);

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

  useEffect(() => {
    if (content.length > LARGE_PREVIEW_THRESHOLD) {
      setAllowLargeRender(false);
    }
  }, [content]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const deferredContent = React.useDeferredValue(content);
  const previewTooLarge = deferredContent.length > LARGE_PREVIEW_THRESHOLD && !allowLargeRender;
  const html = useMemo(() => {
    if (previewTooLarge) return '';
    const raw = marked.parse(deferredContent, { async: false }) as string;
    const { htmlWithIds } = generateHeadingSlugs(raw);
    return htmlWithIds;
  }, [deferredContent, previewTooLarge]);

  const isDark = theme === 'dark';

  // Intercept anchor clicks inside the overflow container
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
      if (el && containerRef.current) {
        const top = (el as HTMLElement).offsetTop - 24;
        containerRef.current.scrollTo({ top, behavior: 'smooth' });
      }
      return;
    }
    e.preventDefault();
    desktopApi.openExternal(href).catch(() => {});
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
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
          if (containerRef.current) {
            range.selectNodeContents(containerRef.current);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        },
      },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="w-full h-full overflow-auto px-6 py-6"
        style={{
          backgroundColor: 'var(--te-bg-primary)',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {previewTooLarge ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>文档较大，已暂停自动预览</div>
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded border"
              style={{ borderColor: 'var(--te-border)', color: 'var(--te-primary)' }}
              onClick={() => setAllowLargeRender(true)}
            >
              刷新预览
            </button>
          </div>
        ) : (
          <div
            className={`prose max-w-none ${isDark ? 'prose-invert' : ''}`}
            style={{ color: 'var(--te-text-primary)' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
});

export default MarkdownPreview;
MarkdownPreview.displayName = 'MarkdownPreview';
