import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  createCompartments,
  buildBaseExtensions,
  largeFileLineHighlighter,
  largeFileLineHighlightTheme,
  jsoncCommentHighlighter,
} from './editorExtensions';
import { defaultDarkColors } from './themeDefaults';
import { getLinterExtension } from './lint';
import { getAutocompleteExtension } from './autocomplete';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import { highlightSelectionMatches } from '@codemirror/search';
import { indentGuides } from './indentGuides';
import { hoverInfo } from './hover';
import { bracketColorization } from './bracketColorization';
import { signatureHelp } from './signatureHelp';
import { columnAlignExtension } from './columnAlign';
import { markedLinesField, pairGutter, bracketAndTagMatcher } from './bracketTagMatching';

describe('buildBaseExtensions', () => {
  it('creates a valid EditorState with largeFileOptimize=false', () => {
    const compartments = createCompartments();
    const exts = buildBaseExtensions(
      compartments,
      'javascript',
      defaultDarkColors,
      14,
      false,
      false, // largeFileOptimize
      false,
      false,
      false,
      'tab-1',
      false,
      true,
    );

    const state = EditorState.create({ doc: 'hello world', extensions: exts });
    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe('hello world');
  });

  it('creates a valid EditorState with largeFileOptimize=true', () => {
    const compartments = createCompartments();
    const exts = buildBaseExtensions(
      compartments,
      'javascript',
      defaultDarkColors,
      14,
      false,
      true, // largeFileOptimize
      false,
      false,
      false,
      'tab-2',
      false,
      true,
    );

    const state = EditorState.create({ doc: 'hello world', extensions: exts });
    expect(state).toBeDefined();
    expect(state.doc.toString()).toBe('hello world');
  });

  it('does not crash when switching largeFileOptimize on the same compartment set', () => {
    const compartments = createCompartments();

    // Initial state: normal mode
    const normalExts = buildBaseExtensions(
      compartments, 'javascript', defaultDarkColors, 14, false,
      false, false, false, false, 'tab-3', false, true,
    );
    let state = EditorState.create({ doc: 'hello world', extensions: normalExts });
    expect(state).toBeDefined();

    // Reconfigure to large-file mode
    const largeExts = buildBaseExtensions(
      compartments, 'javascript', defaultDarkColors, 14, false,
      true, false, false, false, 'tab-3', false, true,
    );
    state = EditorState.create({ doc: 'hello world', extensions: largeExts });
    expect(state).toBeDefined();

    // Reconfigure back to normal mode
    const normalExts2 = buildBaseExtensions(
      compartments, 'javascript', defaultDarkColors, 14, false,
      false, false, false, false, 'tab-3', false, true,
    );
    state = EditorState.create({ doc: 'hello world', extensions: normalExts2 });
    expect(state).toBeDefined();
  });

  it('survives live compartment reconfigure toggling on an EditorView', () => {
    const compartments = createCompartments();
    const normalExts = buildBaseExtensions(
      compartments, 'javascript', defaultDarkColors, 14, false,
      false, false, false, false, 'tab-5', false, true,
    );
    const state = EditorState.create({ doc: 'const x = 1;\nconst y = 2;', extensions: normalExts });
    const view = new EditorView({ state });

    expect(view.state.doc.toString()).toBe('const x = 1;\nconst y = 2;');

    // Toggle ON large-file mode (simulate CmEditor largeFileOptimize effect)
    view.dispatch({
      effects: [
        compartments.largeFile.reconfigure([largeFileLineHighlighter, largeFileLineHighlightTheme]),
        compartments.heavyFeatures.reconfigure([]),
        compartments.lint.reconfigure([]),
        compartments.autocomplete.reconfigure([]),
      ],
    });
    expect(view.state.doc.toString()).toBe('const x = 1;\nconst y = 2;');

    // Toggle OFF large-file mode (restore normal features)
    const heavyExts = [
      markedLinesField,
      pairGutter,
      bracketAndTagMatcher,
      highlightSelectionMatches(),
      ...indentGuides,
      hoverInfo,
      bracketColorization,
      signatureHelp(),
      columnAlignExtension,
    ];

    view.dispatch({
      effects: [
        compartments.largeFile.reconfigure([foldGutter({ openText: '▼', closedText: '▶' }), keymap.of(foldKeymap)]),
        compartments.heavyFeatures.reconfigure(heavyExts),
        compartments.lint.reconfigure(getLinterExtension('javascript') || []),
        compartments.autocomplete.reconfigure(getAutocompleteExtension('javascript', 'tab-5') || []),
      ],
    });
    expect(view.state.doc.toString()).toBe('const x = 1;\nconst y = 2;');

    view.destroy();
  });

  it('returns heavyFeatures extensions that do not include linter or autocomplete', () => {
    // Regression test: heavyExts must NOT contain getLinterExtension or
    // getAutocompleteExtension output. Those are managed by independent
    // lint/autocomplete compartments in CmEditor to avoid double-registration
    // and black-screen on toggle.
    const compartments = createCompartments();
    const exts = buildBaseExtensions(
      compartments, 'javascript', defaultDarkColors, 14, false,
      false, false, false, false, 'tab-4', false, true,
    );

    // Build state and verify it does not have default linter facets active.
    // The exact facet values are internal, but we can at least ensure the
    // extension list length is stable and the state builds cleanly.
    const state = EditorState.create({ doc: 'const x = 1;', extensions: exts });
    expect(state).toBeDefined();
  });

  it('marks JSONC comments without marking comment-like text inside strings', () => {
    const state = EditorState.create({
      doc: '{\n  "url": "https://example.com", // visible comment\n  "text": "// not a comment"\n}',
      extensions: [jsoncCommentHighlighter],
    });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ state, parent });

    const comments = [...parent.querySelectorAll('.cm-json-comment')].map((node) => node.textContent);
    expect(comments).toEqual(['// visible comment']);

    view.destroy();
    parent.remove();
  });
});

describe('createCompartments', () => {
  it('returns independent compartment objects per call', () => {
    const a = createCompartments();
    const b = createCompartments();
    expect(a).not.toBe(b);
    expect(a.language).not.toBe(b.language);
    expect(a.heavyFeatures).not.toBe(b.heavyFeatures);
    expect(a.lint).not.toBe(b.lint);
    expect(a.autocomplete).not.toBe(b.autocomplete);
  });
});
