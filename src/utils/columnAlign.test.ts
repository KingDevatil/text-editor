import { describe, it, expect, vi } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { columnAlignExtension, columnAlignDecorations, setColumnAlign, createColumnDragLayer, columnAlignTabCommand } from './columnAlign';

function createView(doc: string, enabled = true) {
  const state = EditorState.create({
    doc,
    extensions: columnAlignExtension,
  });
  const view = new EditorView({ state });
  if (enabled) {
    view.dispatch({
      effects: setColumnAlign.of({ enabled: true, widths: [] }),
    });
  }
  return view;
}

describe('columnAlignExtension', () => {
  it('does not decorate when disabled', () => {
    const view = createView('a\tb\tc', false);
    const decorations = view.state.field(columnAlignDecorations);
    expect(decorations).toBeDefined();
    // When disabled, decorations should be empty (Decoration.none)
    let hasDecorations = false;
    decorations.between(0, view.state.doc.length, () => {
      hasDecorations = true;
    });
    expect(hasDecorations).toBe(false);
    view.destroy();
  });

  it('replaces tabs with spacer widgets when enabled', () => {
    const view = createView('a\tb\tc', true);
    const decorations = view.state.field(columnAlignDecorations);
    expect(decorations).toBeDefined();

    const ranges: Array<{ from: number; to: number }> = [];
    decorations.between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // 2 tabs -> 1 nowrap line + 3 cell marks + 2 spacers = 6 decorations
    expect(ranges.length).toBe(6);
    // First cell mark 'a' at [0,1], spacer at [1,2], second cell mark 'b' at [2,3], spacer at [3,4], third cell mark 'c' at [4,5]
    expect(ranges[0].from).toBe(0);
    expect(ranges[0].to).toBe(0); // line decoration
    expect(ranges[1].from).toBe(0);
    expect(ranges[1].to).toBe(1); // mark 'a'
    expect(ranges[2].from).toBe(1);
    expect(ranges[2].to).toBe(2); // spacer 1
    expect(ranges[3].from).toBe(2);
    expect(ranges[3].to).toBe(3); // mark 'b'
    expect(ranges[4].from).toBe(3);
    expect(ranges[4].to).toBe(4); // spacer 2
    expect(ranges[5].from).toBe(4);
    expect(ranges[5].to).toBe(5); // mark 'c'
    view.destroy();
  });

  it('handles lines without tabs', () => {
    const view = createView('no tabs here', true);
    const decorations = view.state.field(columnAlignDecorations);
    let hasDecorations = false;
    decorations.between(0, view.state.doc.length, () => {
      hasDecorations = true;
    });
    expect(hasDecorations).toBe(false);
    view.destroy();
  });

  it('handles multiple lines with varying tab counts', () => {
    const view = createView('a\tb\n1\t2\t3\nno-tabs', true);
    const decorations = view.state.field(columnAlignDecorations);

    const ranges: Array<{ from: number; to: number }> = [];
    decorations.between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // Line 1: 1 tab -> 1 line + 2 marks + 1 spacer = 4 (trailing text after last tab also gets a cell)
    // Line 2: 2 tabs -> 1 line + 3 marks + 2 spacers = 6
    // Line 3: 0 tabs -> 0
    expect(ranges.length).toBe(10);
    view.destroy();
  });

  it('updates decorations when toggled off', () => {
    const view = createView('a\tb', true);

    // Toggle off
    view.dispatch({
      effects: setColumnAlign.of({ enabled: false, widths: [] }),
    });

    const decorations = view.state.field(columnAlignDecorations);
    let hasDecorations = false;
    decorations.between(0, view.state.doc.length, () => {
      hasDecorations = true;
    });
    expect(hasDecorations).toBe(false);
    view.destroy();
  });

  it('uses custom widths when provided', () => {
    const view = createView('a\tb\tc', true);

    // Set custom widths
    view.dispatch({
      effects: setColumnAlign.of({ enabled: true, widths: [200, 50] }),
    });

    const decorations = view.state.field(columnAlignDecorations);
    const ranges: Array<{ from: number; to: number }> = [];
    decorations.between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // 2 tabs -> 1 line + 3 marks + 2 spacers = 6
    expect(ranges.length).toBe(6);
    view.destroy();
  });

  it('respects minimum column width', () => {
    const view = createView('a\tb', true);

    // Set a very small width that should be clamped
    view.dispatch({
      effects: setColumnAlign.of({ enabled: true, widths: [5] }),
    });

    const decorations = view.state.field(columnAlignDecorations);
    expect(decorations).toBeDefined();
    view.destroy();
  });
});

describe('columnAlignTabCommand', () => {
  it('inserts tab at cursor position when enabled', () => {
    const state = EditorState.create({
      doc: 'hello world',
      extensions: columnAlignExtension,
    });
    const view = new EditorView({ state });
    // Enable column align
    view.dispatch({
      effects: setColumnAlign.of({ enabled: true, widths: [] }),
    });
    // Place cursor at position 5 (after "hello")
    view.dispatch({
      selection: EditorSelection.cursor(5),
    });

    const handled = columnAlignTabCommand(view);
    expect(handled).toBe(true);
    // Tab should be inserted at position 5 (before the existing space)
    expect(view.state.doc.toString()).toBe('hello\t world');
    // Cursor should be after the inserted tab (position 6)
    expect(view.state.selection.main.head).toBe(6);
    view.destroy();
  });

  it('falls through when disabled', () => {
    const state = EditorState.create({
      doc: 'hello world',
      extensions: columnAlignExtension,
    });
    const view = new EditorView({ state });
    // Column align is disabled by default
    view.dispatch({
      selection: EditorSelection.cursor(5),
    });

    const handled = columnAlignTabCommand(view);
    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe('hello world');
    view.destroy();
  });
});

describe('createColumnDragLayer', () => {
  it('creates and cleans up drag layer', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const view = createView('a\tb\tc', true);

    const cleanup = createColumnDragLayer(container, view, vi.fn());

    // Layer should be created
    const layer = container.querySelector('.cm-column-drag-layer');
    expect(layer).toBeInTheDocument();

    // Cleanup should remove it
    cleanup();
    expect(container.querySelector('.cm-column-drag-layer')).not.toBeInTheDocument();

    view.destroy();
    document.body.removeChild(container);
  });
});
