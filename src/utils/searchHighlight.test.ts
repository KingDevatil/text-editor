import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, type DecorationSet } from '@codemirror/view';
import { searchHighlight, setSearchQuery } from './searchHighlight';
import { buildDynamicTheme } from './themes';
import { defaultDarkColors } from './themeDefaults';

interface SearchPluginInstance {
  decorations: DecorationSet;
  cachedMatches: { from: number; to: number }[];
  rescanViewport(view: EditorView): void;
}

function getSearchPlugin(view: EditorView) {
  return view.plugin(searchHighlight[1] as unknown as ViewPlugin<SearchPluginInstance>)!;
}

describe('searchHighlight', () => {
  it('should create decorations for all matches after setSearchQuery', () => {
    const doc = '{"event_name":"MASTEREQUIP"}\n{"event_name":"MASTEREQUIP"}\n{"event_name":"MASTEREQUIP"}';
    const state = EditorState.create({
      doc,
      extensions: [
        searchHighlight,
        buildDynamicTheme(defaultDarkColors, true),
      ],
    });

    const view = new EditorView({ state });

    // Initial state: no query → no decorations
    const plugin = getSearchPlugin(view);
    expect(plugin.decorations.size).toBe(0);

    // Dispatch search query
    view.dispatch({
      effects: setSearchQuery.of({ query: 'MASTEREQUIP', caseSensitive: false, regexMode: false }),
    });

    // After dispatch: should have 3 decorations
    const updatedPlugin = getSearchPlugin(view);
    expect(updatedPlugin.cachedMatches.length).toBe(3);
    expect(updatedPlugin.decorations.size).toBe(3);

    view.destroy();
  });

  it('should mark the active match with cm-searchMatch-selected', () => {
    const doc = '{"event_name":"MASTEREQUIP"}\n{"event_name":"MASTEREQUIP"}';
    const state = EditorState.create({
      doc,
      extensions: [
        searchHighlight,
        buildDynamicTheme(defaultDarkColors, true),
      ],
    });

    const view = new EditorView({ state });

    view.dispatch({
      effects: setSearchQuery.of({ query: 'MASTEREQUIP', caseSensitive: false, regexMode: false }),
    });

    // Move cursor into the first match
    view.dispatch({ selection: { anchor: 15, head: 26 } });

    const plugin = getSearchPlugin(view);
    const decos = plugin.decorations;

    // Check that at least one decoration has the selected class
    let hasSelected = false;
    decos.between(0, doc.length, (_from: number, _to: number, value: Decoration) => {
      if (value.spec?.class?.includes('cm-searchMatch-selected')) {
        hasSelected = true;
      }
    });
    expect(hasSelected).toBe(true);

    view.destroy();
  });

  it('should only scan viewport area for large files (>200k chars)', () => {
    const prefix = 'MASTEREQUIP';
    const middle = 'x'.repeat(200_000);
    const suffix = 'MASTEREQUIP';
    const doc = prefix + middle + suffix;

    const state = EditorState.create({
      doc,
      extensions: [searchHighlight],
    });
    const view = new EditorView({ state });

    // Mock viewport to only cover the prefix area
    Object.defineProperty(view, 'viewport', {
      value: { from: 0, to: prefix.length },
      configurable: true,
    });

    view.dispatch({
      effects: setSearchQuery.of({ query: 'MASTEREQUIP', caseSensitive: false, regexMode: false }),
    });

    const plugin = getSearchPlugin(view);
    expect(plugin.cachedMatches.length).toBe(1);
    expect(plugin.cachedMatches[0].from).toBe(0);

    view.destroy();
  });

  it('should rescan viewport when it moves in large files', () => {
    const prefix = 'MASTEREQUIP';
    const middle = 'x'.repeat(200_000);
    const suffix = 'MASTEREQUIP';
    const doc = prefix + middle + suffix;

    const state = EditorState.create({
      doc,
      extensions: [searchHighlight],
    });
    const view = new EditorView({ state });

    // Start with viewport at prefix
    Object.defineProperty(view, 'viewport', {
      value: { from: 0, to: prefix.length },
      configurable: true,
    });

    view.dispatch({
      effects: setSearchQuery.of({ query: 'MASTEREQUIP', caseSensitive: false, regexMode: false }),
    });

    const plugin = getSearchPlugin(view);
    expect(plugin.cachedMatches.length).toBe(1);
    expect(plugin.cachedMatches[0].from).toBe(0);

    // Move viewport to suffix area and manually trigger rescan
    Object.defineProperty(view, 'viewport', {
      value: { from: prefix.length + middle.length, to: doc.length },
      configurable: true,
    });

    plugin.rescanViewport(view);

    expect(plugin.cachedMatches.length).toBe(1);
    expect(plugin.cachedMatches[0].from).toBe(prefix.length + middle.length);

    view.destroy();
  });
});
