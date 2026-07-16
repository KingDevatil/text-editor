import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { formatDocument } from './cmCommands';

const mountedViews: Array<{ view: EditorView; parent: HTMLDivElement }> = [];

function createView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc }), parent });
  mountedViews.push({ view, parent });
  return view;
}

afterEach(() => {
  for (const { view, parent } of mountedViews.splice(0)) {
    view.destroy();
    parent.remove();
  }
});

describe('formatDocument', () => {
  it('formats JSONC without dropping comments or trailing commas', () => {
    const view = createView('{\n// keep this note\n"answer":42,\n}');

    expect(formatDocument(view, 'json')).toBe(true);
    const formatted = view.state.doc.toString();
    expect(formatted).toContain('// keep this note');
    expect(formatted).toContain('"answer": 42');
    expect(formatted).toContain('42,');
  });

  it('keeps every JSON Lines record on exactly one line', () => {
    const view = createView('{"a":1}\n{"b":[1,2]}');

    expect(formatDocument(view, 'jsonl')).toBe(true);
    const lines = view.state.doc.toString().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ a: 1 }, { b: [1, 2] }]);
  });

  it('preserves JavaScript line boundaries that may be required by ASI', () => {
    const view = createView('const a = 1\nconst b = 2\nconsole.log(a + b)');

    expect(formatDocument(view, 'javascript')).toBe(true);
    expect(view.state.doc.toString().split('\n')).toHaveLength(3);
    expect(view.state.doc.toString()).toContain('1\nconst b');
  });

  it('fails safely instead of throwing on an unmatched closing brace', () => {
    const view = createView('}');

    expect(() => formatDocument(view, 'javascript')).not.toThrow();
    expect(formatDocument(view, 'javascript')).toBe(false);
    expect(view.state.doc.toString()).toBe('}');
  });

  it('preserves CSS comments containing structural characters', () => {
    const view = createView('/* keep { ; } exactly */\nbody{color:red;}');

    expect(formatDocument(view, 'css')).toBe(true);
    expect(view.state.doc.toString()).toContain('/* keep { ; } exactly */');
  });

  it('does not split structural characters inside CSS function values', () => {
    const view = createView('.icon{background:url(data:image/svg+xml;utf8,<svg>{x}</svg>);}');

    expect(formatDocument(view, 'css')).toBe(true);
    expect(view.state.doc.toString()).toContain('url(data:image/svg+xml;utf8,<svg>{x}</svg>)');
  });

  it('does not indent the root element under an HTML doctype', () => {
    const view = createView('<!DOCTYPE html><html><body>hello</body></html>');

    expect(formatDocument(view, 'html')).toBe(true);
    expect(view.state.doc.toString().split('\n').slice(0, 2)).toEqual([
      '<!DOCTYPE html>',
      '<html>',
    ]);
  });

  it('preserves greater-than characters inside quoted HTML attributes', () => {
    const view = createView('<div title="1 > 0">value</div>');

    expect(formatDocument(view, 'html')).toBe(true);
    expect(view.state.doc.toString()).toContain('title="1 > 0"');
  });

  it('does not rewrite SQL keywords or semicolons inside literals and comments', () => {
    const view = createView("select 'from;where' as value; -- select; from");

    expect(formatDocument(view, 'sql')).toBe(true);
    expect(view.state.doc.toString()).toContain("'from;where'");
    expect(view.state.doc.toString()).toContain('-- select; from');
    expect(view.state.doc.toString()).toContain('SELECT');
  });
});
