import { GutterMarker, gutter } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

class BracketMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-bracket-marker';
    span.title = '成对括号';
    span.textContent = '◆';
    span.style.cssText = `
      color: var(--te-primary);
      font-size: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    `;
    return span;
  }
}

const BRACKETS = '()[]{}<>';

export const bracketMatchingGutter = [
  gutter({
    class: 'cm-bracket-marker-gutter',
    lineMarker(view: EditorView, line: any) {
      const cursorPos = view.state.selection.main.head;
      const char = view.state.doc.sliceString(cursorPos, cursorPos + 1);

      if (BRACKETS.includes(char)) {
        const cursorLine = view.state.doc.lineAt(cursorPos);
        if (line.from === cursorLine.from) {
          return new BracketMarker();
        }
      }

      return null;
    },
    initialSpacer() {
      return new BracketMarker();
    },
  }),
];
