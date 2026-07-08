import { useEffect, type RefObject } from 'react';

const MIN_COLUMN_WIDTH = 48;

function getFirstRowCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.tHead?.rows[0] ?? table.rows[0];
  if (!row) return [];
  return Array.from(row.cells);
}

function getColumnWidths(cells: HTMLTableCellElement[]): number[] {
  return cells.map((cell) => Math.max(MIN_COLUMN_WIDTH, Math.round(cell.getBoundingClientRect().width || cell.offsetWidth || MIN_COLUMN_WIDTH)));
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

  const widths = getColumnWidths(cells);
  const cols = ensureColgroup(table, widths);
  setTableWidth(table, widths);

  const cleanupFns: Array<() => void> = [];

  cells.slice(0, -1).forEach((cell, columnIndex) => {
    cell.classList.add('markdown-resizable-cell');
    const handle = document.createElement('span');
    handle.className = 'markdown-table-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize table column');

    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = widths[columnIndex];
      document.body.classList.add('markdown-table-resizing');

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
        widths[columnIndex] = nextWidth;
        cols[columnIndex].style.width = `${nextWidth}px`;
        setTableWidth(table, widths);
      };

      const handlePointerUp = () => {
        document.body.classList.remove('markdown-table-resizing');
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    };

    handle.addEventListener('pointerdown', handlePointerDown);
    cell.appendChild(handle);
    cleanupFns.push(() => {
      handle.removeEventListener('pointerdown', handlePointerDown);
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
