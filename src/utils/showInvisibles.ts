import { EditorState, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

class EOLWidget extends WidgetType {
  constructor(private readonly symbol: string) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.symbol;
    span.className = 'cm-eol-marker';
    return span;
  }

  eq(other: EOLWidget) {
    return this.symbol === other.symbol;
  }

  ignoreEvent() {
    return true;
  }
}

function getEOLSymbol(state: EditorState): string {
  const sep = state.facet(EditorState.lineSeparator) || '\n';
  if (sep === '\r\n') return '↵';
  if (sep === '\r') return '←';
  return '↓';
}

function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const symbol = getEOLSymbol(state);
  const { doc } = state;

  // Add an EOL marker at the end of every line that has a trailing newline.
  // This includes the empty last line when the document ends with a newline.
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.to < doc.length) {
      builder.add(
        line.to,
        line.to,
        Decoration.widget({ widget: new EOLWidget(symbol), side: 1 })
      );
    }
  }

  return builder.finish();
}

/**
 * CodeMirror extension that draws an end-of-line marker at the end of every
 * line that has a trailing newline.
 */
export const eolMarkers = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildDecorations(tr.state);
    }
    // Rebuild when lineSeparator facet changes so the symbol (↵/↓/←) updates.
    const oldSep = tr.startState.facet(EditorState.lineSeparator) || '\n';
    const newSep = tr.state.facet(EditorState.lineSeparator) || '\n';
    if (oldSep !== newSep) {
      return buildDecorations(tr.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});
