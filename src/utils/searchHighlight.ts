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

function getMatches(doc: any, query: SearchQuery): { from: number; to: number }[] {
  if (!query.query) return [];
  const matches: { from: number; to: number }[] = [];
  try {
    if (query.regexMode) {
      const cursor = new RegExpCursor(doc, query.query, { ignoreCase: !query.caseSensitive }, 0, doc.length);
      if (!cursor) return matches;
      let result;
      while (!(result = cursor.next()).done) {
        matches.push({ from: result.value.from, to: result.value.to });
      }
    } else {
      const normalize = query.caseSensitive ? undefined : (s: string) => s.toLowerCase();
      const cursor = new SearchCursor(doc, query.query, 0, doc.length, normalize);
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

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      const query = update.state.field(searchHighlightField);
      const prevQuery = update.startState.field(searchHighlightField);
      if (
        query !== prevQuery ||
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const query = view.state.field(searchHighlightField);
      if (!query || !query.query) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();
      const matches = getMatches(view.state.doc, query);
      const selection = view.state.selection.main;

      for (const match of matches) {
        const isActive = match.from <= selection.head && match.to >= selection.head;
        const deco = Decoration.mark({
          class: isActive
            ? 'cm-searchMatch cm-searchMatch-selected'
            : 'cm-searchMatch',
        });
        builder.add(match.from, match.to, deco);
      }

      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

export const searchHighlight = [searchHighlightField, searchHighlightPlugin];
