import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { EditorState, StateField } from '@codemirror/state';
import { EditorView, ViewPlugin, type DecorationSet } from '@codemirror/view';
import { getOrCreateCompartments, buildBaseExtensions } from '../utils/editorExtensions';
import { setSearchQuery, searchHighlight, type SearchQuery } from '../utils/searchHighlight';
import { defaultDarkColors } from '../utils/themeDefaults';
import { deleteEditorState, setEditorState, getEditorState, setActiveView, reopenTab } from '../hooks/useEditorStatePool';

interface SearchPluginInstance {
  decorations: DecorationSet;
  cachedMatches: { from: number; to: number }[];
}

function getSearchPlugin(view: EditorView) {
  return view.plugin(searchHighlight[1] as unknown as ViewPlugin<SearchPluginInstance>)!;
}

const searchField = searchHighlight[0] as unknown as StateField<SearchQuery | null>;

describe('CmEditor + searchHighlight integration', () => {
  afterEach(() => {
    // clean up pooled state between tests
    deleteEditorState('tab-test');
  });

  beforeEach(() => {
    reopenTab('tab-test');
  });

  it('should highlight matches when state is created fresh', () => {
    const compartments = getOrCreateCompartments('tab-test');
    const exts = buildBaseExtensions(
      compartments,
      'json',
      defaultDarkColors,
      14,
      false,
      false, // largeFileOptimize = false
      false,
      false,
      true,
      'tab-test',
      false,
      true
    );

    const doc = '{"event_name":"MASTEREQUIP"}\n{"event_name":"MASTEREQUIP"}';
    const state = EditorState.create({ doc, extensions: exts });
    const view = new EditorView({ state });
    setActiveView('tab-test', view);

    // Before search
    const pluginBefore = getSearchPlugin(view);
    expect(pluginBefore.decorations.size).toBe(0);

    // Dispatch search
    view.dispatch({
      effects: setSearchQuery.of({ query: 'MASTEREQUIP', caseSensitive: false, regexMode: false }),
    });

    const pluginAfter = getSearchPlugin(view);
    expect(pluginAfter.cachedMatches.length).toBe(2);
    expect(pluginAfter.decorations.size).toBe(2);

    view.destroy();
    setActiveView('tab-test', null);
  });

  it('should highlight matches when state is reused from pool', () => {
    const compartments = getOrCreateCompartments('tab-test');
    const exts = buildBaseExtensions(
      compartments,
      'json',
      defaultDarkColors,
      14,
      false,
      false,
      false,
      false,
      true,
      'tab-test',
      false,
      true
    );

    const doc = '{"event_name":"MASTEREQUIP"}\n{"event_name":"MASTEREQUIP"}';
    let state = EditorState.create({ doc, extensions: exts });

    // Simulate first mount
    const view1 = new EditorView({ state });
    setEditorState('tab-test', view1.state);
    setActiveView('tab-test', view1);

    // Search on first view
    view1.dispatch({
      effects: setSearchQuery.of({ query: 'MASTEREQUIP', caseSensitive: false, regexMode: false }),
    });
    setEditorState('tab-test', view1.state);

    const plugin1 = getSearchPlugin(view1);
    expect(plugin1.cachedMatches.length).toBe(2);

    // Simulate unmount
    view1.destroy();
    setActiveView('tab-test', null);

    // Simulate remount (reuse pooled state)
    state = getEditorState('tab-test')!;
    // Verify searchHighlightField exists in pooled state
    expect(() => state.field(searchField)).not.toThrow();
    const fieldValue = state.field(searchField);
    expect(fieldValue).not.toBeNull();
    expect(fieldValue?.query).toBe('MASTEREQUIP');

    const view2 = new EditorView({ state });
    setActiveView('tab-test', view2);

    const plugin2 = getSearchPlugin(view2);
    // Plugin is reinstantiated; decorations should be rebuilt from cached field value
    expect(plugin2.cachedMatches.length).toBe(2);
    expect(plugin2.decorations.size).toBe(2);

    view2.destroy();
    setActiveView('tab-test', null);
  });
});
