import React, { useRef, useEffect, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import type { EditorTheme } from '../utils/themes';

interface MinimapProps {
  viewRef: React.MutableRefObject<EditorView | null>;
  theme: EditorTheme;
}

const getVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const Minimap: React.FC<MinimapProps> = ({ viewRef, theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineHRef = useRef(1);
  const virtualLinesRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let pollId: ReturnType<typeof setTimeout>;
    let lastDocLen = -1;
    let lastVpFrom = -1;
    let lastVpTo = -1;
    let lastW = -1;
    let lastH = -1;

    const W = 120;

    const render = () => {
      const view = viewRef.current;
      if (!view) {
        // View not ready yet — poll at 10Hz instead of 60fps RAF to save CPU
        pollId = setTimeout(render, 100);
        return;
      }

      // Pause rendering when container is hidden (e.g. inactive tab with display:none)
      if (container.offsetParent === null) {
        pollId = setTimeout(render, 200);
        return;
      }

      const doc = view.state.doc;
      const viewport = view.viewport;

      // Fast-path: skip layout read if doc and viewport haven't changed
      // (canvas size is checked lazily only when needed)
      if (
        doc.length === lastDocLen &&
        viewport.from === lastVpFrom &&
        viewport.to === lastVpTo &&
        lastH > 0
      ) {
        pollId = setTimeout(render, 200);
        return;
      }

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const H = rect.height;

      // If nothing meaningful changed after reading layout, skip repaint
      if (
        doc.length === lastDocLen &&
        viewport.from === lastVpFrom &&
        viewport.to === lastVpTo &&
        W === lastW &&
        H === lastH
      ) {
        pollId = setTimeout(render, 200);
        return;
      }

      lastDocLen = doc.length;
      lastVpFrom = viewport.from;
      lastVpTo = viewport.to;

      // Update canvas size only when it actually changed
      if (W !== lastW || H !== lastH) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        lastW = W;
        lastH = H;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = getVar('--te-bg-primary');
      ctx.fillRect(0, 0, W, H);

      const lines = doc.lines;

      // 计算编辑器视口大约能容纳多少行，minimap 至少应显示一页内容
      // 避免短文档时把少量行拉伸填充整个 minimap
      const editorHeight = view.dom.getBoundingClientRect().height;
      const realLineHeight = view.defaultLineHeight || 16;
      const viewportLines = Math.max(1, Math.ceil(editorHeight / realLineHeight));
      const virtualLines = Math.max(lines, viewportLines);

      let lineH = H / virtualLines;
      let step = 1;

      // 对于超大文件，按块采样避免逐行循环过慢
      if (lineH < 0.5) {
        step = Math.ceil(0.5 / lineH);
        lineH = H / (virtualLines / step);
      }

      // 保存供 scrollToY 使用
      lineHRef.current = lineH;
      virtualLinesRef.current = virtualLines;

      // 绘制代码缩略：每行/每块用一条灰线表示，长度和透明度随字符数变化
      ctx.fillStyle = getVar('--te-text-secondary');
      for (let i = 1; i <= lines; i += step) {
        let maxLen = 0;
        for (let j = 0; j < step && i + j <= lines; j++) {
          const len = doc.line(i + j).text.trim().length;
          if (len > maxLen) maxLen = len;
        }
        if (maxLen === 0) continue;

        const y = Math.floor((i - 1) / step) * lineH;
        const intensity = Math.min(maxLen / 80, 1);
        ctx.globalAlpha = 0.2 + intensity * 0.4;
        ctx.fillRect(2, y, (W - 4) * intensity, Math.max(lineH, 1));
      }
      ctx.globalAlpha = 1;

      // 绘制当前视口覆盖层
      const fromLine = doc.lineAt(viewport.from).number;
      const toLine = doc.lineAt(viewport.to).number;
      const vpY = (fromLine - 1) / step * lineH;
      const vpH = Math.max((toLine - fromLine + 1) / step * lineH, 3);

      ctx.globalAlpha = 0.08;
      ctx.fillStyle = getVar('--te-text-primary');
      ctx.fillRect(0, vpY, W, vpH);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = getVar('--te-border');
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, vpY + 0.5, W - 1, vpH - 1);

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(pollId);
    };
  }, [viewRef, theme]);

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
