import {
  EditorView,
  Decoration,
  type DecorationSet,
  WidgetType,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSetBuilder, EditorSelection } from '@codemirror/state';

const DEFAULT_COL_WIDTH = 120;
const MIN_COL_WIDTH = 40;
const COL_PADDING = 16;
const TAB_REGEX = /\t/g;

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += ch.charCodeAt(0) > 127 ? 14 : 7;
  }
  return width;
}

export interface ColumnAlignConfig {
  enabled: boolean;
  widths: number[];
}

export const setColumnAlign = StateEffect.define<ColumnAlignConfig>();

export const columnAlignField = StateField.define<ColumnAlignConfig>({
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

class InlineBlockWidget extends WidgetType {
  constructor(
    private width: number,
    private className: string
  ) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.className;
    span.style.display = 'inline-block';
    span.style.width = `${this.width}px`;
    // Zero-width space gives the cursor a text node to anchor on
    span.textContent = '\u200B';
    return span;
  }

  eq(other: InlineBlockWidget) {
    return this.width === other.width && this.className === other.className;
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

function cellMarkStyle(width: number, isLast = false): string {
  const base = 'display:inline-block;vertical-align:top;';
  if (isLast) {
    // Last column: no fixed width so text flows naturally instead of being clipped
    return base;
  }
  return `${base}max-width:${width}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
}

function buildDecorations(state: EditorState): DecorationSet {
  const config = state.field(columnAlignField);
  if (!config.enabled) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();

  for (let pos = 0; pos < state.doc.length; ) {
    const line = state.doc.lineAt(pos);
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
        const targetWidth = getColumnWidth(config, colIdx);

        if (start < i) {
          const textSlice = text.slice(start, i);
          const estimatedWidth = estimateTextWidth(textSlice);
          const initialSpacerWidth = Math.max(
            COL_PADDING,
            targetWidth - estimatedWidth + COL_PADDING
          );
          builder.add(
            line.from + start,
            tabPos,
            Decoration.mark({
              class: 'cm-column-cell',
              attributes: {
                style: cellMarkStyle(targetWidth),
              },
            })
          );
          builder.add(
            tabPos,
            tabPos + 1,
            Decoration.replace({
              widget: new InlineBlockWidget(
                initialSpacerWidth,
                'cm-column-spacer cm-column-spacer-dynamic'
              ),
            })
          );
        } else {
          // Consecutive tabs (or leading tab) => empty column placeholder
          builder.add(
            tabPos,
            tabPos,
            Decoration.widget({
              widget: new InlineBlockWidget(targetWidth, 'cm-column-cell cm-column-empty'),
              side: -1,
            })
          );
          builder.add(
            tabPos,
            tabPos + 1,
            Decoration.replace({
              widget: new InlineBlockWidget(COL_PADDING, 'cm-column-spacer'),
            })
          );
        }

        start = i + 1;
        colIdx++;
      }
    }

    // Handle trailing text after the last tab — final column has no fixed width
    // so long text is not clipped.
    if (colIdx > 0 && start < text.length) {
      builder.add(
        line.from + start,
        line.to,
        Decoration.mark({
          class: 'cm-column-cell',
          attributes: {
            style: cellMarkStyle(getColumnWidth(config, colIdx), true),
          },
        })
      );
    }

    // Handle trailing empty column when line ends with a tab.
    if (colIdx > 0 && start === text.length) {
      builder.add(
        line.to,
        line.to,
        Decoration.widget({
          widget: new InlineBlockWidget(getColumnWidth(config, colIdx), 'cm-column-cell cm-column-empty'),
          side: 1,
        })
      );
    }

    pos = line.to + 1;
  }

  return builder.finish();
}

export const columnAlignDecorations = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    const config = tr.state.field(columnAlignField);
    const prevConfig = tr.startState.field(columnAlignField);
    if (config !== prevConfig || tr.docChanged) {
      return buildDecorations(tr.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const columnAlignDynamicPlugin = ViewPlugin.fromClass(
  class {
    private rafId: number | null = null;

    constructor(view: EditorView) {
      this.scheduleAdjust(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.scheduleAdjust(update.view);
      }
    }

    scheduleAdjust(view: EditorView) {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.adjustSpacers(view);
      });
    }

    adjustSpacers(view: EditorView) {
      const config = view.state.field(columnAlignField);
      if (!config.enabled) return;

      const { from, to } = view.viewport;
      for (let pos = from; pos < to; ) {
        const line = view.state.doc.lineAt(pos);
        const text = line.text;
        if (!text.includes('\t')) {
          pos = line.to + 1;
          continue;
        }

        let start = 0;
        let colIdx = 0;

        for (let i = 0; i < text.length; i++) {
          if (text[i] === '\t') {
            const tabPos = line.from + i;
            const targetWidth = getColumnWidth(config, colIdx);

            if (start < i) {
              const startCoords = view.coordsAtPos(line.from + start);
              const tabCoords = view.coordsAtPos(tabPos);
              if (startCoords && tabCoords) {
                const textWidth = tabCoords.left - startCoords.left;
                const newWidth = Math.max(
                  COL_PADDING,
                  targetWidth - textWidth + COL_PADDING
                );

                const domInfo = view.domAtPos(tabPos);
                let el: HTMLElement | null = domInfo.node as HTMLElement;
                while (el && !el.classList.contains('cm-column-spacer-dynamic')) {
                  el = el.parentElement;
                }
                if (el) {
                  const currentWidth = parseFloat(el.style.width) || 0;
                  if (Math.abs(currentWidth - newWidth) > 0.5) {
                    el.style.width = `${newWidth}px`;
                  }
                }
              }
            }

            start = i + 1;
            colIdx++;
          }
        }

        pos = line.to + 1;
      }
    }

    destroy() {
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
      }
    }
  }
);

const COLUMN_ALIGN_THEME = EditorView.theme({
  '.cm-column-spacer': {
    verticalAlign: 'top',
    background: 'color-mix(in srgb, var(--te-border) 15%, transparent)',
    borderRadius: '2px',
  },
  '.cm-column-cell': {
    verticalAlign: 'top',
  },
});

export const columnAlignExtension = [
  COLUMN_ALIGN_THEME,
  columnAlignField,
  columnAlignDecorations,
  columnAlignDynamicPlugin,
];

/**
 * Tab command for column-align mode: inserts a literal tab character at cursor.
 * Falls through (returns false) when column align is not active.
 */
export function columnAlignTabCommand(view: EditorView): boolean {
  const config = view.state.field(columnAlignField, false);
  if (config?.enabled) {
    const { state } = view;
    const changes = state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: '\t' },
      range: EditorSelection.range(range.from + 1, range.from + 1),
    }));
    view.dispatch(state.update(changes, { userEvent: 'input' }));
    return true;
  }
  return false;
}

/**
 * Shift+Tab command for column-align mode: deletes the previous tab character.
 * Falls through (returns false) when column align is not active.
 */
export function columnAlignShiftTabCommand(view: EditorView): boolean {
  const config = view.state.field(columnAlignField, false);
  if (config?.enabled) {
    const { state } = view;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const relPos = pos - line.from;
    const prevTab = line.text.lastIndexOf('\t', relPos - 1);
    if (prevTab !== -1) {
      view.dispatch({
        changes: { from: line.from + prevTab, to: line.from + prevTab + 1 },
        selection: EditorSelection.cursor(line.from + prevTab),
        userEvent: 'input',
      });
      return true;
    }
    return true;
  }
  return false;
}

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

    // Find all lines with tabs to determine column count (global, not viewport-scoped)
    let maxCols = 0;
    for (let pos = 0; pos < view.state.doc.length; ) {
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
