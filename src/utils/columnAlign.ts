import {
  EditorView,
  Decoration,
  ViewPlugin,
  ViewUpdate,
  type DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';

const DEFAULT_COL_WIDTH = 120;
const MIN_COL_WIDTH = 40;
const COL_PADDING = 16;
const TAB_REGEX = /\t/g;

export interface ColumnAlignConfig {
  enabled: boolean;
  widths: number[];
  computedWidths?: number[];
}

export const setColumnAlign = StateEffect.define<ColumnAlignConfig>();

const columnAlignField = StateField.define<ColumnAlignConfig>({
  create() {
    return { enabled: false, widths: [] };
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setColumnAlign)) {
        return effect.value;
      }
    }
    return value;
  },
});

class ColumnSpacerWidget extends WidgetType {
  constructor(private width: number) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-column-spacer';
    span.style.display = 'inline-block';
    span.style.width = `${this.width}px`;
    return span;
  }

  eq(other: ColumnSpacerWidget) {
    return this.width === other.width;
  }

  ignoreEvent() {
    return true;
  }
}

let measureCtx: CanvasRenderingContext2D | null = null;
let lastFont = '';

function getMeasureContext(view: EditorView): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureCtx) {
    const canvas = document.createElement('canvas');
    measureCtx = canvas.getContext('2d');
  }
  if (!measureCtx) return null;
  const contentEl = view.dom.querySelector('.cm-content') as HTMLElement | null;
  if (contentEl) {
    const style = window.getComputedStyle(contentEl);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (font !== lastFont) {
      measureCtx.font = font;
      lastFont = font;
    }
  }
  return measureCtx;
}

function measureText(ctx: CanvasRenderingContext2D | null, text: string, view: EditorView): number {
  if (!ctx) {
    const charWidth = view.defaultCharacterWidth || 8;
    return text.length * charWidth;
  }
  const contentEl = view.dom.querySelector('.cm-content') as HTMLElement | null;
  if (contentEl) {
    const style = window.getComputedStyle(contentEl);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (font !== lastFont) {
      ctx.font = font;
      lastFont = font;
    }
  }
  return ctx.measureText(text).width;
}

function getColumnWidth(
  config: ColumnAlignConfig,
  colIndex: number
): number {
  if (config.widths[colIndex] !== undefined) {
    return Math.max(MIN_COL_WIDTH, config.widths[colIndex]);
  }
  if (config.computedWidths && config.computedWidths[colIndex] !== undefined) {
    return Math.max(MIN_COL_WIDTH, config.computedWidths[colIndex]);
  }
  return DEFAULT_COL_WIDTH;
}

const columnAlignPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    private measuredLineNumbers: Set<number> = new Set();
    private localComputed: number[] = [];

    constructor(view: EditorView) {
      const computed = this.computeWidths(view);
      if (computed) this.localComputed = computed;
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      const config = update.state.field(columnAlignField);
      const prevConfig = update.startState.field(columnAlignField);
      if (
        config !== prevConfig ||
        update.docChanged ||
        update.viewportChanged
      ) {
        if (update.docChanged) {
          this.measuredLineNumbers.clear();
        }
        if (update.docChanged || update.viewportChanged) {
          const computed = this.computeWidths(update.view);
          if (computed) {
            this.localComputed = computed;
            // Delay dispatch to avoid re-entrant update
            Promise.resolve().then(() => {
              try {
                update.view.dispatch({
                  effects: setColumnAlign.of({
                    enabled: config.enabled,
                    widths: config.widths,
                    computedWidths: computed,
                  }),
                });
              } catch {
                // view may have been destroyed
              }
            });
          }
        }
        this.decorations = this.build(update.view);
      }
    }

    computeWidths(view: EditorView): number[] | null {
      const ctx = getMeasureContext(view);
      const config = view.state.field(columnAlignField);
      const newComputed = [...(config.computedWidths || [])];
      let changed = false;

      for (let pos = view.viewport.from; pos < view.viewport.to; ) {
        const line = view.state.doc.lineAt(pos);
        if (this.measuredLineNumbers.has(line.number)) {
          pos = line.to + 1;
          continue;
        }
        this.measuredLineNumbers.add(line.number);

        let start = 0;
        let colIdx = 0;
        const text = line.text;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '\t') {
            const content = text.slice(start, i);
            const width = measureText(ctx, content, view);
            if (width > (newComputed[colIdx] || 0)) {
              newComputed[colIdx] = width;
              changed = true;
            }
            start = i + 1;
            colIdx++;
          }
        }
        pos = line.to + 1;
      }

      return changed ? newComputed : null;
    }

    build(view: EditorView): DecorationSet {
      const config = view.state.field(columnAlignField);
      if (!config.enabled) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();

      for (let pos = view.viewport.from; pos < view.viewport.to; ) {
        const line = view.state.doc.lineAt(pos);
        const text = line.text;

        // Prevent inline-block spacers from wrapping to next visual line
        if (text.includes('\t')) {
          builder.add(
            line.from,
            line.from,
            Decoration.line({
              attributes: { style: 'white-space: nowrap;' },
            })
          );
        }

        let start = 0;
        let colIdx = 0;

        for (let i = 0; i < text.length; i++) {
          if (text[i] === '\t') {
            const tabPos = line.from + i;
            const targetWidth =
              config.widths[colIdx] !== undefined
                ? Math.max(MIN_COL_WIDTH, config.widths[colIdx])
                : Math.max(
                    MIN_COL_WIDTH,
                    this.localComputed[colIdx] || DEFAULT_COL_WIDTH
                  );

            if (start < i) {
              builder.add(
                line.from + start,
                tabPos,
                Decoration.mark({
                  class: 'cm-column-cell',
                  attributes: {
                    style: `display:inline-block;width:${targetWidth}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top;`,
                  },
                })
              );
            }

            builder.add(
              tabPos,
              tabPos + 1,
              Decoration.replace({
                widget: new ColumnSpacerWidget(COL_PADDING),
              })
            );

            start = i + 1;
            colIdx++;
          }
        }

        pos = line.to + 1;
      }

      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

const COLUMN_ALIGN_THEME = EditorView.theme({
  '.cm-column-spacer': {
    verticalAlign: 'bottom',
  },
  '.cm-column-cell': {
    verticalAlign: 'top',
  },
});

export const columnAlignExtension = [
  COLUMN_ALIGN_THEME,
  columnAlignField,
  columnAlignPlugin,
];

/**
 * Create a drag handle layer for column resizing.
 * Returns a cleanup function.
 */
export function createColumnDragLayer(
  container: HTMLElement,
  view: EditorView,
  onWidthsChange: (widths: number[]) => void
): () => void {
  const dragLayer = document.createElement('div');
  dragLayer.className = 'cm-column-drag-layer';
  dragLayer.style.cssText =
    'position:absolute;top:0;left:0;right:0;height:100%;pointer-events:none;z-index:10;';
  container.appendChild(dragLayer);

  let isDragging = false;
  let dragColIndex = -1;
  let startX = 0;
  let startWidth = 0;

  function updateHandles() {
    // Clear existing handles
    dragLayer.innerHTML = '';

    const config = view.state.field(columnAlignField);
    if (!config.enabled) return;

    // Find visible lines with tabs to determine column count
    let maxCols = 0;
    for (let pos = view.viewport.from; pos < view.viewport.to; ) {
      const line = view.state.doc.lineAt(pos);
      const tabCount = (line.text.match(TAB_REGEX) || []).length;
      maxCols = Math.max(maxCols, tabCount);
      pos = line.to + 1;
    }
    if (maxCols === 0) return;

    // Calculate cumulative positions for handles
    const contentRect = view.contentDOM.getBoundingClientRect();

    let cumulativeX = contentRect.left - container.getBoundingClientRect().left;

    for (let i = 0; i < maxCols; i++) {
      const colWidth = getColumnWidth(config, i);
      cumulativeX += colWidth + COL_PADDING;

      const handle = document.createElement('div');
      handle.className = 'cm-column-drag-handle';
      handle.dataset.colIndex = String(i);
      handle.style.cssText =
        `position:absolute;top:0;left:${cumulativeX}px;width:4px;height:100%;` +
        `cursor:col-resize;pointer-events:auto;` +
        `background:color-mix(in srgb, var(--te-border) 30%, transparent);`;
      handle.addEventListener('mouseenter', () => {
        handle.style.background = 'var(--te-primary)';
        handle.style.opacity = '0.5';
      });
      handle.addEventListener('mouseleave', () => {
        if (!isDragging) {
          handle.style.background = 'color-mix(in srgb, var(--te-border) 30%, transparent)';
          handle.style.opacity = '1';
        }
      });
      handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragColIndex = i;
        startX = e.clientX;
        const cfg = view.state.field(columnAlignField);
        startWidth = getColumnWidth(cfg, i);
        e.preventDefault();
      });
      dragLayer.appendChild(handle);
    }
  }

  let pendingWidth: number | null = null;
  let rafId: number | null = null;

  function flushPendingWidth() {
    rafId = null;
    if (pendingWidth !== null && dragColIndex >= 0) {
      const cfg = view.state.field(columnAlignField);
      const newWidths = [...cfg.widths];
      newWidths[dragColIndex] = pendingWidth;
      view.dispatch({
        effects: setColumnAlign.of({
          enabled: cfg.enabled,
          widths: newWidths,
          computedWidths: cfg.computedWidths,
        }),
      });
      onWidthsChange(newWidths);
      pendingWidth = null;
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging || dragColIndex < 0) return;
    const delta = e.clientX - startX;
    pendingWidth = Math.max(MIN_COL_WIDTH, startWidth + delta);
    if (rafId === null) {
      rafId = requestAnimationFrame(flushPendingWidth);
    }
  }

  function onMouseUp() {
    isDragging = false;
    dragColIndex = -1;
    // Refresh handle visuals
    updateHandles();
  }

  // Initial render and update on viewport changes
  updateHandles();

  const updateHandler = () => {
    requestAnimationFrame(updateHandles);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  view.scrollDOM.addEventListener('scroll', updateHandler);

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    view.scrollDOM.removeEventListener('scroll', updateHandler);
    if (dragLayer.parentNode) {
      dragLayer.parentNode.removeChild(dragLayer);
    }
  };
}
