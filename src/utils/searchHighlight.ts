import { EditorView, Decoration, ViewPlugin, ViewUpdate, type DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { SearchCursor, RegExpCursor } from '@codemirror/search';

export interface SearchQuery {
  query: string;
  caseSensitive: boolean;
  regexMode: boolean;
}

export const setSearchQuery = StateEffect.define<SearchQuery | null>();

const searchHighlightField = StateField.define<SearchQuery | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSearchQuery)) {
        return effect.value;
      }
    }
    return value;
  },
});

const MAX_HIGHLIGHT_CHARS = 200_000;

function getMatches(
  doc: any,
  query: SearchQuery,
  from: number,
  to: number
): { from: number; to: number }[] {
  if (!query.query) return [];
  const matches: { from: number; to: number }[] = [];
  try {
    if (query.regexMode) {
      const cursor = new RegExpCursor(doc, query.query, { ignoreCase: !query.caseSensitive }, from, to);
      if (!cursor) return matches;
      let result;
      while (!(result = cursor.next()).done) {
        matches.push({ from: result.value.from, to: result.value.to });
      }
    } else {
      const normalize = query.caseSensitive ? undefined : (s: string) => s.toLowerCase();
      const cursor = new SearchCursor(doc, query.query, from, to, normalize);
      let result;
      while (!(result = cursor.next()).done) {
        matches.push({ from: result.value.from, to: result.value.to });
      }
    }
  } catch {
    // Invalid regex or other error
  }
  return matches;
}

const searchHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    cachedMatches: { from: number; to: number }[] = [];
    cachedQuery: SearchQuery | null = null;

    constructor(view: EditorView) {
      this.rebuild(view);
    }

    update(update: ViewUpdate) {
      const query = update.state.field(searchHighlightField);
      const prevQuery = update.startState.field(searchHighlightField);

      const queryChanged =
        query?.query !== prevQuery?.query ||
        query?.caseSensitive !== prevQuery?.caseSensitive ||
        query?.regexMode !== prevQuery?.regexMode;

      if (queryChanged || update.docChanged) {
        this.rebuild(update.view);
      } else if (update.selectionSet) {
        this.updateSelection(update.view);
      }
    }

    /** Re-scan matches when query or document changes. */
    rebuild(view: EditorView) {
      const query = view.state.field(searchHighlightField);
      this.cachedQuery = query;

      if (!query || !query.query) {
        this.cachedMatches = [];
        this.decorations = Decoration.none;
        return;
      }

      const scanTo = Math.min(view.state.doc.length, MAX_HIGHLIGHT_CHARS);
      this.cachedMatches = getMatches(view.state.doc, query, 0, scanTo);
      this.updateSelection(view);
    }

    /** Re-build decorations from cached matches when only selection changes. */
    updateSelection(view: EditorView) {
      if (!this.cachedMatches.length) {
        this.decorations = Decoration.none;
        return;
      }

      const selection = view.state.selection.main;
      const builder = new RangeSetBuilder<Decoration>();

      for (const match of this.cachedMatches) {
        const isActive = match.from <= selection.head && match.to >= selection.head;
        const deco = Decoration.mark({
          class: isActive
            ? 'cm-searchMatch cm-searchMatch-selected'
            : 'cm-searchMatch',
        });
        builder.add(match.from, match.to, deco);
      }

      this.decorations = builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

export const searchHighlight = [searchHighlightField, searchHighlightPlugin];
