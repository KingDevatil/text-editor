import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Maximize2, Minimize2, MousePointer2, RotateCw, X } from 'lucide-react';
import { subscribeContentChange } from '../hooks/useEditorStatePool';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { prepareHtmlSrcDoc } from '../utils/htmlPreview';
import visualEditorRuntime from '../vendor/html-visual-editor/editor.js?raw';

const LARGE_PREVIEW_THRESHOLD = 1024 * 1024;
const EXPORT_MESSAGE = 'te-html-preview-export';
const EXPORTED_MESSAGE = 'te-html-preview-exported';

interface HtmlPreviewProps {
  tabId: string;
  theme: string;
  visible?: boolean;
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onApplyHtml?: (html: string) => void;
}

const HtmlPreview: React.FC<HtmlPreviewProps> = React.memo(({
  tabId,
  theme,
  visible = true,
  fullScreen = false,
  onToggleFullScreen,
  onApplyHtml,
}) => {
  const [content, setContent] = useState('');
  const [allowLargeRender, setAllowLargeRender] = useState(false);
  const [visualEditing, setVisualEditing] = useState(false);
  const [applyState, setApplyState] = useState<'idle' | 'pending' | 'applied'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const exportTokenRef = useRef('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const isFirstRef = useRef(true);

  if (!exportTokenRef.current) {
    exportTokenRef.current = `${tabId}-${Math.random().toString(36).slice(2)}`;
  }

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
      if (applyStateTimerRef.current) {
        clearTimeout(applyStateTimerRef.current);
        applyStateTimerRef.current = null;
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
  const srcDoc = useMemo(
    () => previewTooLarge ? '' : prepareVisualPreviewSrcDoc(content, isDark, visualEditing, exportTokenRef.current),
    [content, isDark, previewTooLarge, visualEditing]
  );

  useEffect(() => {
    if (!visible || !onApplyHtml) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; token?: string; html?: string };
      if (data?.type !== EXPORTED_MESSAGE || data.token !== exportTokenRef.current || typeof data.html !== 'string') return;
      onApplyHtml(data.html);
      setApplyState('applied');
      if (applyStateTimerRef.current) clearTimeout(applyStateTimerRef.current);
      applyStateTimerRef.current = setTimeout(() => setApplyState('idle'), 1200);
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [visible, onApplyHtml]);

  const handleApplyVisualEdits = useCallback(() => {
    const win = getFrameWindow(iframeRef.current);
    if (!win) return;
    setApplyState('pending');
    win.postMessage({
      type: EXPORT_MESSAGE,
      token: exportTokenRef.current,
    }, '*');
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      {
        id: 'reload',
        label: '刷新预览',
        icon: <RotateCw size={14} />,
        action: () => {
          if (iframeRef.current) {
            iframeRef.current.srcdoc = srcDoc;
          }
        },
      },
      {
        id: 'copy-html',
        label: '复制 HTML',
        icon: <Clipboard size={14} />,
        action: async () => {
          await navigator.clipboard?.writeText(content);
        },
      },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [content, srcDoc]);

  const applyLabel = applyState === 'applied' ? '已应用' : applyState === 'pending' ? '正在应用' : '应用到编辑器';

  return (
    <>
      <div
        className="w-full h-full overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--te-bg-primary)' }}
        onContextMenu={handleContextMenu}
      >
        <div
          className="h-10 px-2 border-b flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: 'var(--te-border)', backgroundColor: 'var(--te-bg-secondary)' }}
        >
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              className="h-7 px-2 rounded-md text-xs inline-flex items-center gap-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
              style={visualEditing ? { color: 'var(--te-primary)', backgroundColor: 'color-mix(in srgb, var(--te-primary) 14%, transparent)' } : { color: 'var(--te-text-primary)' }}
              onClick={() => setVisualEditing((value) => !value)}
              title="可视化编辑"
            >
              {visualEditing ? <X size={14} /> : <MousePointer2 size={14} />}
              <span className="hidden sm:inline">{visualEditing ? '退出精修' : '可视精修'}</span>
            </button>
            {visualEditing && (
              <button
                type="button"
                className="h-7 px-2 rounded-md text-xs inline-flex items-center gap-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)] disabled:opacity-60"
                style={{ color: applyState === 'applied' ? 'var(--te-primary)' : 'var(--te-text-primary)' }}
                onClick={handleApplyVisualEdits}
                disabled={applyState === 'pending'}
                title="将可视化修改写回当前 HTML"
              >
                <Check size={14} />
                <span className="hidden sm:inline">{applyLabel}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
              style={{ color: 'var(--te-text-primary)' }}
              onClick={() => {
                if (iframeRef.current) iframeRef.current.srcdoc = srcDoc;
              }}
              title="刷新预览"
            >
              <RotateCw size={14} />
            </button>
            {onToggleFullScreen && (
              <button
                type="button"
                className="h-7 w-7 rounded-md inline-flex items-center justify-center transition-colors hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
                style={{ color: 'var(--te-text-primary)' }}
                onClick={onToggleFullScreen}
                title={fullScreen ? '退出全屏' : '全屏预览'}
              >
                {fullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
          </div>
        </div>
        {previewTooLarge ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
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
            sandbox="allow-scripts allow-same-origin"
            srcDoc={srcDoc}
            className="w-full flex-1 border-none"
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

function prepareVisualPreviewSrcDoc(content: string, isDark: boolean, visualEditing: boolean, token: string): string {
  const base = prepareHtmlSrcDoc(content, isDark);
  if (!visualEditing) return base;

  const runtimeScript = `<script data-te-visual-runtime="1">\n${escapeScript(visualEditorRuntime)}\n</script>`;
  const bridgeScript = `<script data-te-visual-bridge="1">\n${createBridgeScript(token)}\n</script>`;
  const injection = `${runtimeScript}\n${bridgeScript}`;

  if (/<\/body>/i.test(base)) {
    return base.replace(/<\/body>/i, `${injection}</body>`);
  }
  if (/<\/html>/i.test(base)) {
    return base.replace(/<\/html>/i, `${injection}</html>`);
  }
  return `${base}${injection}`;
}

function escapeScript(script: string): string {
  return script.replace(/<\/script/gi, '<\\/script');
}

function createBridgeScript(token: string): string {
  return `
(function(){
  var TOKEN = ${JSON.stringify(token)};
  var EXPORT_MESSAGE = ${JSON.stringify(EXPORT_MESSAGE)};
  var EXPORTED_MESSAGE = ${JSON.stringify(EXPORTED_MESSAGE)};

  function cleanEditorArtifacts(root) {
    var editorSrc = '';
    var editorScript = document.querySelector('script[data-ve][src]') || document.querySelector('script[src*="editor.js"]');
    if (editorScript && editorScript.src) editorSrc = editorScript.src;

    removeAll(root.querySelectorAll('#__ve-root, .__ve-toggle, style[data-ve], script[data-ve], [data-te-preview-artifact], script[data-te-visual-runtime], script[data-te-visual-bridge]'));
    removeAll(root.querySelectorAll('script[src]'), function(script) {
      var src = script.getAttribute('src') || '';
      if (/(^|\\/)editor\\.js(?:[?#].*)?$/i.test(src)) return true;
      if (editorSrc) {
        try { return new URL(src, window.location.href).href === editorSrc; }
        catch (e) { return src === editorSrc; }
      }
      return false;
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-ve-editing], [data-ve-prev-contenteditable]'), function(el) {
      var prev = el.getAttribute('data-ve-prev-contenteditable');
      if (prev && prev !== '__ve_absent') el.setAttribute('contenteditable', prev);
      else el.removeAttribute('contenteditable');
      el.removeAttribute('data-ve-editing');
      el.removeAttribute('data-ve-prev-contenteditable');
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-ve-dragging]'), function(el) {
      el.removeAttribute('data-ve-dragging');
    });
  }

  function removeAll(nodes, predicate) {
    Array.prototype.forEach.call(nodes, function(node) {
      if (!predicate || predicate(node)) {
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    });
  }

  function exportHTML() {
    var clone = document.documentElement.cloneNode(true);
    cleanEditorArtifacts(clone);
    return '<!DOCTYPE html>\\n' + clone.outerHTML;
  }

  window.addEventListener('message', function(event) {
    var data = event.data || {};
    if (data.type !== EXPORT_MESSAGE || data.token !== TOKEN) return;
    window.parent.postMessage({ type: EXPORTED_MESSAGE, token: TOKEN, html: exportHTML() }, '*');
  });

  function enterEditMode() {
    var toggle = document.querySelector('.__ve-toggle');
    if (toggle && !toggle.classList.contains('active')) toggle.click();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(enterEditMode, 120); });
  } else {
    setTimeout(enterEditMode, 120);
  }
})();`;
}

function getFrameWindow(iframe: HTMLIFrameElement | null): Window | null {
  try {
    return iframe?.contentWindow ?? null;
  } catch {
    return null;
  }
}
