import { useEffect, type RefObject } from 'react';

const MIN_COLUMN_WIDTH = 48;

interface TableResizeState {
  widths: number[];
  userResized: boolean;
}

interface TableEnhancement {
  cleanup: () => void;
  state: TableResizeState;
}

function getFirstRowCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.tHead?.rows[0] ?? table.rows[0];
  if (!row) return [];
  return Array.from(row.cells);
}

function getAvailableTableWidth(table: HTMLTableElement, container: HTMLElement): number {
  const parentWidth = table.parentElement?.getBoundingClientRect().width ?? 0;
  const containerWidth = container.getBoundingClientRect().width || container.clientWidth || 0;
  const layoutWidths = [parentWidth, containerWidth].filter((width) => width > 0);
  return Math.max(layoutWidths.length > 0 ? Math.min(...layoutWidths) : 0, MIN_COLUMN_WIDTH);
}

function getInitialColumnWidths(
  table: HTMLTableElement,
  container: HTMLElement,
  columnCount: number
): number[] {
  const availableWidth = getAvailableTableWidth(table, container);
  const width = Math.max(MIN_COLUMN_WIDTH, Math.floor(availableWidth / columnCount));
  return Array.from({ length: columnCount }, () => width);
}

function setTableWidth(table: HTMLTableElement, widths: number[]) {
  table.style.setProperty('table-layout', 'fixed', 'important');
  table.style.setProperty('width', `${widths.reduce((sum, width) => sum + width, 0)}px`, 'important');
  table.style.setProperty('min-width', '100%', 'important');
  table.style.setProperty('max-width', 'none', 'important');
}

function setColumnWidth(col: HTMLTableColElement, width: number) {
  col.style.setProperty('width', `${width}px`, 'important');
  col.style.setProperty('min-width', `${width}px`, 'important');
  col.style.setProperty('max-width', `${width}px`, 'important');
}

function ensureColgroup(table: HTMLTableElement, widths: number[]): HTMLTableColElement[] {
  let colgroup = table.querySelector(':scope > colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    table.insertBefore(colgroup, table.firstChild);
  }

  while (colgroup.children.length < widths.length) {
    colgroup.appendChild(document.createElement('col'));
  }
  while (colgroup.children.length > widths.length) {
    colgroup.lastElementChild?.remove();
  }

  const cols = Array.from(colgroup.children) as HTMLTableColElement[];
  cols.forEach((col, index) => {
    setColumnWidth(col, widths[index]);
  });
  return cols;
}

function enhanceTable(
  table: HTMLTableElement,
  container: HTMLElement,
  savedState?: TableResizeState
): TableEnhancement {
  const cells = getFirstRowCells(table);
  if (cells.length < 2) {
    return {
      cleanup: () => {},
      state: savedState ?? { widths: [], userResized: false },
    };
  }
  const state = savedState && savedState.widths.length === cells.length
    ? savedState
    : {
        widths: getInitialColumnWidths(table, container, cells.length),
        userResized: false,
      };
  if (table.dataset.resizableMarkdownTable === 'true') {
    return { cleanup: () => {}, state };
  }

  table.dataset.resizableMarkdownTable = 'true';
  table.classList.add('markdown-resizable-table');

  const widths = state.widths;
  const cols = ensureColgroup(table, widths);
  setTableWidth(table, widths);

  const cleanupFns: Array<() => void> = [];

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => {
        if (state.userResized) return;
        const nextWidths = getInitialColumnWidths(table, container, cells.length);
        if (nextWidths.every((width, index) => width === widths[index])) return;
        nextWidths.forEach((width, index) => {
          widths[index] = width;
          setColumnWidth(cols[index], width);
        });
        setTableWidth(table, widths);
      });
  if (resizeObserver) {
    if (table.parentElement) resizeObserver.observe(table.parentElement);
    if (table.parentElement !== container) resizeObserver.observe(container);
    cleanupFns.push(() => resizeObserver.disconnect());
  }

  cells.slice(0, -1).forEach((cell, columnIndex) => {
    cell.classList.add('markdown-resizable-cell');
    const handle = document.createElement('span');
    handle.className = 'markdown-table-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize table column');

    const handleResizeStart = (event: PointerEvent | MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startLeftWidth = widths[columnIndex];
      const startRightWidth = widths[columnIndex + 1];
      state.userResized = true;
      document.body.classList.add('markdown-table-resizing');
      table.classList.add('markdown-table-is-resizing');

      const handleMove = (moveEvent: PointerEvent | MouseEvent) => {
        moveEvent.preventDefault();
        const requestedDelta = moveEvent.clientX - startX;
        const delta = Math.max(
          MIN_COLUMN_WIDTH - startLeftWidth,
          Math.min(requestedDelta, startRightWidth - MIN_COLUMN_WIDTH)
        );
        widths[columnIndex] = startLeftWidth + delta;
        widths[columnIndex + 1] = startRightWidth - delta;
        setColumnWidth(cols[columnIndex], widths[columnIndex]);
        setColumnWidth(cols[columnIndex + 1], widths[columnIndex + 1]);
        setTableWidth(table, widths);
      };

      const handleEnd = () => {
        document.body.classList.remove('markdown-table-resizing');
        table.classList.remove('markdown-table-is-resizing');
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleEnd);
      window.addEventListener('pointercancel', handleEnd);
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
    };

    handle.addEventListener('pointerdown', handleResizeStart);
    handle.addEventListener('mousedown', handleResizeStart);
    cell.appendChild(handle);
    cleanupFns.push(() => {
      handle.removeEventListener('pointerdown', handleResizeStart);
      handle.removeEventListener('mousedown', handleResizeStart);
      handle.remove();
      cell.classList.remove('markdown-resizable-cell');
    });
  });

  return {
    state,
    cleanup: () => {
      cleanupFns.forEach((cleanup) => cleanup());
      table.classList.remove('markdown-resizable-table');
      delete table.dataset.resizableMarkdownTable;
    },
  };
}

export function useResizableMarkdownTables(
  containerRef: RefObject<HTMLElement | null>,
  contentKey: string,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const tableCleanups = new Map<HTMLTableElement, () => void>();
    const tableStates = new Map<number, TableResizeState>();
    const syncTables = () => {
      const currentTableList = Array.from(container.querySelectorAll<HTMLTableElement>('table'));
      const currentTables = new Set(currentTableList);

      tableCleanups.forEach((cleanup, table) => {
        if (currentTables.has(table)) return;
        cleanup();
        tableCleanups.delete(table);
      });

      currentTableList.forEach((table, tableIndex) => {
        if (tableCleanups.has(table)) return;
        const enhancement = enhanceTable(table, container, tableStates.get(tableIndex));
        tableStates.set(tableIndex, enhancement.state);
        tableCleanups.set(table, enhancement.cleanup);
      });
    };

    syncTables();
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(syncTables);
    mutationObserver?.observe(container, { childList: true, subtree: true });

    return () => {
      mutationObserver?.disconnect();
      tableCleanups.forEach((cleanup) => cleanup());
      tableCleanups.clear();
    };
  }, [containerRef, contentKey, enabled]);
}
