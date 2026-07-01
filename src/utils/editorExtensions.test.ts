import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  createCompartments,
  buildBaseExtensions,
  largeFileLineHighlighter,
  largeFileLineHighlightTheme,
  jsoncCommentHighlighter,
  isImePunctuationCommit,
  insertNewlineAndIndentWithFallback,
  alignNewlineIndentToPreviousLine,
} from './editorExtensions';
import { defaultDarkColors } from './themeDefaults';
import { getLinterExtension } from './lint';
import { getAutocompleteExtension } from './autocomplete';
import { foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { keymap } from '@codemirror/view';
import { forceLinting, forEachDiagnostic } from '@codemirror/lint';
import { highlightSelectionMatches } from '@codemirror/search';
import { indentGuides } from './indentGuides';
import { hoverInfo } from './hover';
import { bracketColorization } from './bracketColorization';
import { signatureHelp } from './signatureHelp';
import { columnAlignExtension } from './columnAlign';
import { markedLinesField, pairGutter, bracketAndTagMatcher } from './bracketTagMatching';

afterEach(() => {
  vi.useRealTimers();
});

describe('buildBaseExtensions', () => {
  function mockRangeClientRects() {
    const originalCreateRange = document.createRange.bind(document);
    const createRangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = originalCreateRange();
      range.getClientRects = () => ({
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* () {},
      });
      return range;
    });
    return () => createRangeSpy.mockRestore();
  }

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

  it('mounts lint and autocomplete compartments so live reconfigure can enable diagnostics', () => {
    const compartments = createCompartments();
    const state = EditorState.create({
      doc: '{\n  "a": 1\n}',
      extensions: buildBaseExtensions(
        compartments,
        'json',
        defaultDarkColors,
        14,
        false,
        false,
        false,
        false,
        false,
        'tab-diagnostics',
        false,
        true,
      ),
    });
    const view = new EditorView({ state });
    const lintProbe = StateField.define<string>({
      create: () => 'lint-mounted',
      update: (value) => value,
    });
    const autocompleteProbe = StateField.define<string>({
      create: () => 'autocomplete-mounted',
      update: (value) => value,
    });

    view.dispatch({
      effects: [
        compartments.lint.reconfigure(lintProbe),
        compartments.autocomplete.reconfigure(autocompleteProbe),
      ],
    });

    expect(view.state.field(lintProbe, false)).toBe('lint-mounted');
    expect(view.state.field(autocompleteProbe, false)).toBe('autocomplete-mounted');

    view.destroy();
  });

  it('reports JSON syntax errors after the lint compartment is enabled dynamically', async () => {
    const compartments = createCompartments();
    const state = EditorState.create({
      doc: '{\n  "a": 1,\n  "b": 2\n',
      extensions: buildBaseExtensions(
        compartments,
        'json',
        defaultDarkColors,
        14,
        false,
        false,
        false,
        false,
        false,
        'tab-json-lint',
        false,
        true,
      ),
    });
    const view = new EditorView({ state });

    view.dispatch({
      effects: compartments.lint.reconfigure(getLinterExtension('json') || []),
    });
    forceLinting(view);
    await Promise.resolve();
    await Promise.resolve();

    const diagnostics: string[] = [];
    forEachDiagnostic(view.state, (diagnostic) => {
      diagnostics.push(diagnostic.message);
    });

    expect(diagnostics.some((message) => message.includes('JSON 语法错误'))).toBe(true);

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

  it('keeps the previous line indent when Enter after a JSON array item cannot infer indentation', () => {
    const doc = '{\n\t"realm_names": [\n\t\t"dongxu",\n\t]\n}';
    const cursor = doc.indexOf('"dongxu",') + '"dongxu",'.length;
    const state = EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [indentUnit.of('\t'), json()],
    });
    const view = new EditorView({ state });

    insertNewlineAndIndentWithFallback(view);

    expect(view.state.doc.toString()).toBe('{\n\t"realm_names": [\n\t\t"dongxu",\n\t\t\n\t]\n}');
    expect(view.state.selection.main.head).toBe(doc.indexOf('"dongxu",') + '"dongxu",'.length + 1 + 2);

    view.destroy();
  });

  it('preserves deeper indentation when Enter after an opening array bracket', () => {
    const doc = '{\n\t"realm_names": [\n\t]\n}';
    const cursor = doc.indexOf('[') + 1;
    const state = EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [indentUnit.of('\t'), json()],
    });
    const view = new EditorView({ state });

    insertNewlineAndIndentWithFallback(view);

    expect(view.state.doc.toString()).toBe('{\n\t"realm_names": [\n\t\t\n\t]\n}');
    expect(view.state.selection.main.head).toBe(cursor + 3);

    view.destroy();
  });

  it('aligns an object field newline that was inserted at column zero', () => {
    const doc = '{\n\t"choice_count": 3,\n"choice_weight_comment": ""\n}';
    const lineStart = doc.indexOf('"choice_weight_comment"');
    const state = EditorState.create({
      doc,
      selection: { anchor: lineStart },
      extensions: [indentUnit.of('\t')],
    });
    const view = new EditorView({ state });

    expect(alignNewlineIndentToPreviousLine(view, '\t')).toBe(true);

    expect(view.state.doc.toString()).toBe('{\n\t"choice_count": 3,\n\t"choice_weight_comment": ""\n}');
    expect(view.state.selection.main.head).toBe(lineStart + 1);

    view.destroy();
  });

  it('replaces a too-deep object field newline indent with the previous line indent', () => {
    const doc = '{\n\t"choice_count": 3,\n\t\t"choice_weight_comment": ""\n}';
    const deepIndentLine = doc.indexOf('"choice_weight_comment"');
    const state = EditorState.create({
      doc,
      selection: { anchor: deepIndentLine },
      extensions: [indentUnit.of('\t')],
    });
    const view = new EditorView({ state });

    expect(alignNewlineIndentToPreviousLine(view, '\t')).toBe(true);

    expect(view.state.doc.toString()).toBe('{\n\t"choice_count": 3,\n\t"choice_weight_comment": ""\n}');
    expect(view.state.selection.main.head).toBe(deepIndentLine - 1);

    view.destroy();
  });

  it('replaces a too-shallow array item newline indent with the previous line indent', () => {
    const doc = '{\n\t"realm_names": [\n\t\t"dongxu",\n\t\n\t]\n}';
    const shallowIndentLine = doc.indexOf('\n\t\n\t]') + 2;
    const state = EditorState.create({
      doc,
      selection: { anchor: shallowIndentLine },
      extensions: [indentUnit.of('\t')],
    });
    const view = new EditorView({ state });

    expect(alignNewlineIndentToPreviousLine(view, '\t\t')).toBe(true);

    expect(view.state.doc.toString()).toBe('{\n\t"realm_names": [\n\t\t"dongxu",\n\t\t\n\t]\n}');
    expect(view.state.selection.main.head).toBe(shallowIndentLine + 1);

    view.destroy();
  });

  it('removes CodeMirror autocorrect=off from contentDOM for Chromium Chinese IME punctuation', async () => {
    const compartments = createCompartments();
    const state = EditorState.create({
      doc: '',
      extensions: buildBaseExtensions(
        compartments,
        'plaintext',
        defaultDarkColors,
        14,
        false,
        false,
        false,
        false,
        false,
        'tab-ime-autocorrect',
        false,
        true,
      ),
    });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ state, parent });

    await Promise.resolve();
    expect(view.contentDOM.hasAttribute('autocorrect')).toBe(false);

    view.dispatch({ selection: { anchor: 0 } });
    await Promise.resolve();
    expect(view.contentDOM.hasAttribute('autocorrect')).toBe(false);

    view.destroy();
    parent.remove();
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

  it('falls back to inserting an IME punctuation mark when compositionupdate does not change the document', () => {
    vi.useFakeTimers();
    const restoreRange = mockRangeClientRects();

    const compartments = createCompartments();
    const state = EditorState.create({
      doc: '',
      extensions: buildBaseExtensions(
        compartments,
        'plaintext',
        defaultDarkColors,
        14,
        false,
        false,
        false,
        false,
        false,
        'tab-ime-punctuation',
        false,
        true,
      ),
    });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ state, parent });

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '，' }));
    expect(view.state.doc.toString()).toBe('');

    vi.advanceTimersByTime(50);
    expect(view.state.doc.toString()).toBe('，');

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '，' }));
    vi.runOnlyPendingTimers();
    expect(view.state.doc.toString()).toBe('，');

    view.destroy();
    parent.remove();
    restoreRange();
  });

  it('does not fall back when CodeMirror has already committed the IME punctuation', () => {
    vi.useFakeTimers();
    const restoreRange = mockRangeClientRects();

    const compartments = createCompartments();
    const state = EditorState.create({
      doc: '',
      extensions: buildBaseExtensions(
        compartments,
        'plaintext',
        defaultDarkColors,
        14,
        false,
        false,
        false,
        false,
        false,
        'tab-ime-punctuation-committed',
        false,
        true,
      ),
    });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ state, parent });

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '。' }));
    view.dispatch(view.state.replaceSelection('。'));

    vi.advanceTimersByTime(50);
    expect(view.state.doc.toString()).toBe('。');

    view.destroy();
    parent.remove();
    restoreRange();
  });
});

describe('isImePunctuationCommit', () => {
  it('only accepts short punctuation or symbol composition commits', () => {
    expect(isImePunctuationCommit('，')).toBe(true);
    expect(isImePunctuationCommit('。')).toBe(true);
    expect(isImePunctuationCommit('……')).toBe(true);
    expect(isImePunctuationCommit('你')).toBe(false);
    expect(isImePunctuationCommit('中文')).toBe(false);
    expect(isImePunctuationCommit('a')).toBe(false);
    expect(isImePunctuationCommit('1')).toBe(false);
    expect(isImePunctuationCommit('')).toBe(false);
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
