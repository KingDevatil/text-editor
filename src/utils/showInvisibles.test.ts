import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState, StateEffect } from '@codemirror/state';
import { eolMarkers } from './showInvisibles';

function createState(doc: string, lineSeparator?: string) {
  const extensions = [eolMarkers];
  if (lineSeparator) {
    extensions.push(EditorState.lineSeparator.of(lineSeparator));
  }
  return EditorState.create({ doc, extensions });
}

describe('eolMarkers', () => {
  beforeEach(() => {
    // Ensure jsdom is available
    expect(typeof document).toBe('object');
  });

  it('creates decorations for lines with trailing newlines', () => {
    const state = createState('line1\nline2\nline3');
    const decorations = state.field(eolMarkers);

    const ranges: Array<{ from: number; to: number }> = [];
    decorations.between(0, state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // 3 lines, 2 trailing newlines -> 2 EOL markers
    expect(ranges.length).toBe(2);
    expect(ranges[0].from).toBe(5); // end of "line1"
    expect(ranges[1].from).toBe(11); // end of "line2"
  });

  it('includes EOL marker for trailing newline but not for empty last line itself', () => {
    const state = createState('a\nb\n');
    const decorations = state.field(eolMarkers);

    const ranges: Array<{ from: number; to: number }> = [];
    decorations.between(0, state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // 3 lines, but only 2 trailing newlines (after "a" and after "b").
    // The empty last line has no trailing newline of its own.
    expect(ranges.length).toBe(2);
    expect(ranges[0].from).toBe(1); // end of "a"
    expect(ranges[1].from).toBe(3); // end of "b"
  });

  it('does not create EOL marker for last line without trailing newline', () => {
    const state = createState('line1\nline2');
    const decorations = state.field(eolMarkers);

    const ranges: Array<{ from: number; to: number }> = [];
    decorations.between(0, state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // 2 lines, only first has trailing newline -> 1 EOL marker
    expect(ranges.length).toBe(1);
    expect(ranges[0].from).toBe(5);
  });

  it('returns empty decorations for single line without newline', () => {
    const state = createState('no newline');
    const decorations = state.field(eolMarkers);

    let hasDecorations = false;
    decorations.between(0, state.doc.length, () => {
      hasDecorations = true;
    });

    expect(hasDecorations).toBe(false);
  });

  it('rebuilds decorations when doc changes', () => {
    let state = createState('a\nb');
    const tr = state.update({ changes: { from: 1, to: 1, insert: '\n' } });
    state = tr.state;

    const decorations = state.field(eolMarkers);
    const ranges: Array<{ from: number; to: number }> = [];
    decorations.between(0, state.doc.length, (from, to) => {
      ranges.push({ from, to });
    });

    // Now "a\n\nb" -> 3 lines, 2 trailing newlines
    expect(ranges.length).toBe(2);
  });

  it('rebuilds decorations when lineSeparator facet changes', () => {
    const stateLF = createState('a\nb\n');
    const decorationsLF = stateLF.field(eolMarkers);

    // Simulate a transaction that changes lineSeparator
    const stateCRLF = stateLF.update({
      effects: StateEffect.appendConfig.of(EditorState.lineSeparator.of('\r\n')),
    }).state;

    const decorationsCRLF = stateCRLF.field(eolMarkers);

    // Both should have 2 decorations, but the widget symbol should differ.
    // We verify the field was rebuilt by checking the decoration sets are different instances.
    expect(decorationsCRLF).not.toBe(decorationsLF);
  });
});
