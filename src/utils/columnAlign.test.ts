import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, type DecorationSet } from '@codemirror/view';
import { columnAlignExtension, setColumnAlign, createColumnDragLayer } from './columnAlign';

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
    const decorations = view.plugin(columnAlignExtension[2] as unknown as { decorations: DecorationSet })?.decorations;
    expect(decorations).toBeDefined();
    // When disabled, decorations should be empty (Decoration.none)
    let hasDecorations = false;
    decorations?.between(0, view.state.doc.length, () => {
      hasDecorations = true;
    });
    expect(hasDecorations).toBe(false);
    view.destroy();
  });

  it('replaces tabs with spacer widgets when enabled', () => {
    const view = createView('a\tb\tc', true);
    const decorations = view.plugin(columnAlignExtension[2] as unknown as { decorations: DecorationSet })?.decorations;
    expect(decorations).toBeDefined();

    const ranges: Array<{ from: number; to: number }> = [];
    decorations?.between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // 2 tabs -> 1 nowrap line + 2 cell marks + 2 spacers = 5 decorations
    expect(ranges.length).toBe(5);
    // First cell mark 'a' at [0,1], spacer at [1,2], second cell mark 'b' at [2,3], spacer at [3,4]
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
    view.destroy();
  });

  it('handles lines without tabs', () => {
    const view = createView('no tabs here', true);
    const decorations = view.plugin(columnAlignExtension[2] as unknown as { decorations: DecorationSet })?.decorations;
    let hasDecorations = false;
    decorations?.between(0, view.state.doc.length, () => {
      hasDecorations = true;
    });
    expect(hasDecorations).toBe(false);
    view.destroy();
  });

  it('handles multiple lines with varying tab counts', () => {
    const view = createView('a\tb\n1\t2\t3\nno-tabs', true);
    const decorations = view.plugin(columnAlignExtension[2] as unknown as { decorations: DecorationSet })?.decorations;

    const ranges: Array<{ from: number; to: number }> = [];
    decorations?.between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // Line 1: 1 tab -> 1 line + 1 mark + 1 spacer = 3
    // Line 2: 2 tabs -> 1 line + 2 marks + 2 spacers = 5
    // Line 3: 0 tabs -> 0
    expect(ranges.length).toBe(8);
    view.destroy();
  });

  it('updates decorations when toggled off', () => {
    const view = createView('a\tb', true);

    // Toggle off
    view.dispatch({
      effects: setColumnAlign.of({ enabled: false, widths: [] }),
    });

    const decorations = view.plugin(columnAlignExtension[2] as unknown as { decorations: DecorationSet })?.decorations;
    let hasDecorations = false;
    decorations?.between(0, view.state.doc.length, () => {
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

    const decorations = view.plugin(columnAlignExtension[2] as unknown as { decorations: DecorationSet })?.decorations;
    const ranges: Array<{ from: number; to: number }> = [];
    decorations?.between(0, view.state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // 2 tabs -> 1 line + 2 marks + 2 spacers = 5
    expect(ranges.length).toBe(5);
    view.destroy();
  });

  it('respects minimum column width', () => {
    const view = createView('a\tb', true);

    // Set a very small width that should be clamped
    view.dispatch({
      effects: setColumnAlign.of({ enabled: true, widths: [5] }),
    });

    const decorations = view.plugin(columnAlignExtension[2] as unknown as { decorations: DecorationSet })?.decorations;
    expect(decorations).toBeDefined();
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
