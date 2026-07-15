import React, { useRef, useEffect, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';
import type { EditorTheme } from '../utils/themes';
import { subscribeEditorUpdate } from '../hooks/useEditorStatePool';

interface MinimapProps {
  tabId: string;
  viewRef: React.MutableRefObject<EditorView | null>;
  theme: EditorTheme;
}

const getVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const Minimap: React.FC<MinimapProps> = ({ tabId, viewRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualLinesRef = useRef(1);
  const animationFrameRef = useRef<number | null>(null);
  const sampleCacheRef = useRef<{
    doc: Text;
    height: number;
    virtualLines: number;
    step: number;
    intensities: number[];
  } | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const view = viewRef.current;
    if (!canvas || !container || !view) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pause rendering when container is hidden
    if (container.offsetParent === null) return;

    const doc = view.state.doc;
    const viewport = view.viewport;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = 120;
    const H = rect.height;

    if (W <= 0 || H <= 0) return;

    const pixelWidth = Math.round(W * dpr);
    const pixelHeight = Math.round(H * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = getVar('--te-bg-primary');
    ctx.fillRect(0, 0, W, H);

    const lines = doc.lines;

    // 计算编辑器视口大约能容纳多少行，minimap 至少应显示一页内容
    const editorHeight = view.dom.getBoundingClientRect().height;
    const realLineHeight = view.defaultLineHeight || 16;
    const viewportLines = Math.max(1, Math.ceil(editorHeight / realLineHeight));
    const virtualLines = Math.max(lines, viewportLines);

    // Never inspect more blocks than the minimap has vertical pixels. For each
    // block, sample its start/middle/end lines instead of scanning every line.
    const maxSamples = Math.max(1, Math.floor(H));
    const step = Math.max(1, Math.ceil(virtualLines / maxSamples));
    const sampleRows = Math.max(1, Math.ceil(virtualLines / step));
    const lineH = H / sampleRows;
    virtualLinesRef.current = virtualLines;

    let cache = sampleCacheRef.current;
    if (
      !cache
      || cache.doc !== doc
      || cache.height !== H
      || cache.virtualLines !== virtualLines
      || cache.step !== step
    ) {
      const intensities: number[] = [];
      for (let start = 1; start <= lines; start += step) {
        const end = Math.min(lines, start + step - 1);
        const middle = start + Math.floor((end - start) / 2);
        let maxLen = 0;
        for (const lineNumber of new Set([start, middle, end])) {
          maxLen = Math.max(maxLen, doc.line(lineNumber).text.trim().length);
        }
        intensities.push(Math.min(maxLen / 80, 1));
      }
      cache = { doc, height: H, virtualLines, step, intensities };
      sampleCacheRef.current = cache;
    }

    // 绘制代码缩略：采样块长度和透明度随字符数变化
    ctx.fillStyle = getVar('--te-text-secondary');
    for (let index = 0; index < cache.intensities.length; index += 1) {
      const intensity = cache.intensities[index];
      if (intensity === 0) continue;
      const y = index * lineH;
      ctx.globalAlpha = 0.2 + intensity * 0.4;
      ctx.fillRect(2, y, (W - 4) * intensity, Math.max(lineH, 1));
    }
    ctx.globalAlpha = 1;

    // 绘制当前视口覆盖层
    const fromLine = doc.lineAt(viewport.from).number;
    const toLine = doc.lineAt(viewport.to).number;
    const vpY = ((fromLine - 1) / virtualLines) * H;
    const vpH = Math.max(((toLine - fromLine + 1) / virtualLines) * H, 3);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = getVar('--te-text-primary');
    ctx.fillRect(0, vpY, W, vpH);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = getVar('--te-border');
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, vpY + 0.5, W - 1, vpH - 1);
  }, [viewRef]);

  const requestRender = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      render();
    });
  }, [render]);

  useEffect(() => {
    // Subscribe to CodeMirror updates (content, viewport, selection changes)
    const unsubscribeUpdate = subscribeEditorUpdate(tabId, requestRender);

    // Listen to scroll events on the editor scroller
    let scrollCleanup: (() => void) | null = null;
    const setupScroll = () => {
      const view = viewRef.current;
      if (!view) return;
      const scroller = view.dom.querySelector('.cm-scroller');
      if (!scroller) return;
      const onScroll = () => requestRender();
      scroller.addEventListener('scroll', onScroll, { passive: true });
      scrollCleanup = () => scroller.removeEventListener('scroll', onScroll);
    };
    setupScroll();

    // Debounced window resize handler
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => requestRender(), 100);
    };
    window.addEventListener('resize', onResize);

    // Re-render when theme colors change (injected via themeInjector)
    const onThemeChange = () => render();
    window.addEventListener('te-theme-change', onThemeChange);

    return () => {
      unsubscribeUpdate();
      scrollCleanup?.();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('te-theme-change', onThemeChange);
      if (resizeTimeout) clearTimeout(resizeTimeout);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [tabId, viewRef, render, requestRender]);

  const isDraggingRef = useRef(false);

  const scrollToY = useCallback(
    (clientY: number) => {
      const view = viewRef.current;
      const container = containerRef.current;
      if (!view || !container) return;

      const rect = container.getBoundingClientRect();
      const y = clientY - rect.top;
      const lines = view.state.doc.lines;
      const H = rect.height;
      const virtualLines = virtualLinesRef.current;

      // 整个画布高度 H 对应 virtualLines 行（包含短文档时的视口填充）
      // 直接将点击 Y 坐标按比例映射到虚拟行数
      const ratio = Math.max(0, Math.min(1, y / H));
      const targetLine = Math.floor(ratio * (virtualLines - 1)) + 1;
      const clampedLine = Math.min(targetLine, lines);

      const line = view.state.doc.line(clampedLine);

      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
      });
    },
    [viewRef]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true;
      scrollToY(e.clientY);
    },
    [scrollToY]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const view = viewRef.current;
      if (!view) return;
      // Forward wheel delta to the editor scroller
      const scroller = view.dom.querySelector('.cm-scroller') as HTMLElement | null;
      if (scroller) {
        scroller.scrollTop += e.deltaY;
      }
    },
    [viewRef]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      scrollToY(e.clientY);
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [scrollToY]);

  return (
    <div
      ref={containerRef}
      className="w-[120px] h-full flex-shrink-0 relative cursor-pointer select-none border-l"
      style={{
        borderColor: getVar('--te-border'),
      }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      title="拖动或点击跳转到对应位置"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};

export default React.memo(Minimap);
