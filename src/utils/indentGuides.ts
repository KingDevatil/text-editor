import { ViewPlugin, ViewUpdate, Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const INDENT_GUIDE_THEME = EditorView.theme({
  '.cm-indent-guide': {
    borderRight: '1px solid rgba(128, 128, 128, 0.22)',
  },
  '.dark .cm-indent-guide': {
    borderRight: '1px solid rgba(160, 160, 160, 0.25)',
  },
});

/**
 * Light-weight indent-guide ViewPlugin.
 * Adds a subtle right-border to every N-th leading whitespace character,
 * where N is the editor's tabSize.
 */
export const indentGuides = [
  INDENT_GUIDE_THEME,
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }

      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const tabSize = view.state.tabSize || 2;

        for (let pos = view.viewport.from; pos < view.viewport.to; ) {
          const line = view.state.doc.lineAt(pos);
          const text = line.text;

          let visualCol = 0;
          for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === ' ') {
              visualCol++;
            } else if (ch === '\t') {
              // Tab advances to the next multiple of tabSize
              visualCol += tabSize - (visualCol % tabSize);
            } else {
              break;
            }

            // Add a guide on the character that completes this indent level
            if (visualCol > 0 && visualCol % tabSize === 0) {
              const deco = Decoration.mark({ class: 'cm-indent-guide' });
              builder.add(line.from + i, line.from + i + 1, deco);
            }
          }

          pos = line.to + 1;
        }

        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  ),
];
