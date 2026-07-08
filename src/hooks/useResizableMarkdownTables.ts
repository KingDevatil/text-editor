import { useEffect, type RefObject } from 'react';

const MIN_COLUMN_WIDTH = 48;

function getFirstRowCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.tHead?.rows[0] ?? table.rows[0];
  if (!row) return [];
  return Array.from(row.cells);
}

function getAvailableTableWidth(table: HTMLTableElement): number {
  const parentWidth = table.parentElement?.getBoundingClientRect().width ?? 0;
  const tableWidth = table.getBoundingClientRect().width || table.offsetWidth || 0;
  return Math.max(parentWidth, tableWidth, MIN_COLUMN_WIDTH);
}

function getInitialColumnWidths(table: HTMLTableElement, columnCount: number): number[] {
  const availableWidth = getAvailableTableWidth(table);
  const width = Math.max(MIN_COLUMN_WIDTH, Math.floor(availableWidth / columnCount));
  return Array.from({ length: columnCount }, () => width);
}

function setTableWidth(table: HTMLTableElement, widths: number[]) {
  table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
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
    col.style.width = `${widths[index]}px`;
  });
  return cols;
}

function enhanceTable(table: HTMLTableElement): () => void {
  if (table.dataset.resizableMarkdownTable === 'true') return () => {};

  const cells = getFirstRowCells(table);
  if (cells.length < 2) return () => {};

  table.dataset.resizableMarkdownTable = 'true';
  table.classList.add('markdown-resizable-table');

  const widths = getInitialColumnWidths(table, cells.length);
  const cols = ensureColgroup(table, widths);
  setTableWidth(table, widths);
  let userResized = false;

  const cleanupFns: Array<() => void> = [];

  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(() => {
        if (userResized) return;
        const nextWidths = getInitialColumnWidths(table, cells.length);
        nextWidths.forEach((width, index) => {
          widths[index] = width;
          cols[index].style.width = `${width}px`;
        });
        setTableWidth(table, widths);
      });
  if (resizeObserver && table.parentElement) {
    resizeObserver.observe(table.parentElement);
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
      const startWidth = widths[columnIndex];
      userResized = true;
      document.body.classList.add('markdown-table-resizing');
      table.classList.add('markdown-table-is-resizing');

      const handleMove = (moveEvent: PointerEvent | MouseEvent) => {
        moveEvent.preventDefault();
        const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
        widths[columnIndex] = nextWidth;
        cols[columnIndex].style.width = `${nextWidth}px`;
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

  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
    table.classList.remove('markdown-resizable-table');
    delete table.dataset.resizableMarkdownTable;
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

    const cleanups = Array.from(container.querySelectorAll<HTMLTableElement>('table')).map(enhanceTable);
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [containerRef, contentKey, enabled]);
}
