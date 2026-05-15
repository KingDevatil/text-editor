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

function getColumnWidth(
  config: ColumnAlignConfig,
  colIndex: number
): number {
  if (config.widths[colIndex] !== undefined) {
    return Math.max(MIN_COL_WIDTH, config.widths[colIndex]);
  }
  return DEFAULT_COL_WIDTH;
}

const columnAlignPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    constructor(view: EditorView) {
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
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const config = view.state.field(columnAlignField);
      if (!config.enabled) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();

      for (let pos = view.viewport.from; pos < view.viewport.to; ) {
        const line = view.state.doc.lineAt(pos);
        const text = line.text;

        // Find all tab positions in this line
        const tabPositions: number[] = [];
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '\t') {
            tabPositions.push(line.from + i);
          }
        }

        // Replace each tab with a spacer widget of the column's configured width
        for (let colIndex = 0; colIndex < tabPositions.length; colIndex++) {
          const tabPos = tabPositions[colIndex];
          const width = getColumnWidth(config, colIndex);
          const spacer = new ColumnSpacerWidget(width + COL_PADDING);
          builder.add(tabPos, tabPos + 1, Decoration.replace({ widget: spacer }));
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
        effects: setColumnAlign.of({ enabled: cfg.enabled, widths: newWidths }),
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
