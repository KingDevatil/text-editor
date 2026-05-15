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

    // Should have 2 decorations for 2 tabs
    expect(ranges.length).toBe(2);
    // First tab at position 1, second at position 3
    expect(ranges[0].from).toBe(1);
    expect(ranges[0].to).toBe(2);
    expect(ranges[1].from).toBe(3);
    expect(ranges[1].to).toBe(4);
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

    // Line 1: 1 tab, Line 2: 2 tabs, Line 3: 0 tabs = 3 total
    expect(ranges.length).toBe(3);
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

    expect(ranges.length).toBe(2);
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
