import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Clipboard } from 'lucide-react';
import { getEditorContent } from '../hooks/useEditorStatePool';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { prepareHtmlSrcDoc } from '../utils/htmlPreview';

interface HtmlPreviewProps {
  tabId: string;
  theme: string;
  visible?: boolean;
}

const HtmlPreview: React.FC<HtmlPreviewProps> = React.memo(({ tabId, theme, visible = true }) => {
  const [content, setContent] = useState('');
  const rafRef = useRef<number | null>(null);
  const lastContentRef = useRef('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  // Poll content changes using requestAnimationFrame
  useEffect(() => {
    if (!visible) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

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
        rafRef.current = null;
      }
    };
  }, [tabId, visible]);

  const isDark = theme === 'dark';
  const srcDoc = useMemo(() => prepareHtmlSrcDoc(content, isDark), [content, isDark]);

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
        <iframe
          ref={iframeRef}
          title="HTML Preview"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="w-full h-full border-none"
          style={{ backgroundColor: 'var(--te-bg-primary)' }}
        />
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
