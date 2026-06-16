import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Clipboard } from 'lucide-react';
import { subscribeContentChange } from '../hooks/useEditorStatePool';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { prepareHtmlSrcDoc } from '../utils/htmlPreview';

const LARGE_PREVIEW_THRESHOLD = 1024 * 1024;

interface HtmlPreviewProps {
  tabId: string;
  theme: string;
  visible?: boolean;
}

const HtmlPreview: React.FC<HtmlPreviewProps> = React.memo(({ tabId, theme, visible = true }) => {
  const [content, setContent] = useState('');
  const [allowLargeRender, setAllowLargeRender] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
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

  const isDark = theme === 'dark';
  const previewTooLarge = content.length > LARGE_PREVIEW_THRESHOLD && !allowLargeRender;
  const srcDoc = useMemo(() => previewTooLarge ? '' : prepareHtmlSrcDoc(content, isDark), [content, isDark, previewTooLarge]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      {
        id: 'reload',
        label: '刷新预览',
        icon: <Clipboard size={14} />,
        action: () => {
          if (iframeRef.current) {
            iframeRef.current.srcdoc = srcDoc;
          }
        },
      },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [srcDoc]);

  return (
    <>
      <div
        className="w-full h-full overflow-hidden"
        style={{ backgroundColor: 'var(--te-bg-primary)' }}
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
          <iframe
            ref={iframeRef}
            title="HTML Preview"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            className="w-full h-full border-none"
            style={{ backgroundColor: 'var(--te-bg-primary)' }}
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

HtmlPreview.displayName = 'HtmlPreview';

export default HtmlPreview;
