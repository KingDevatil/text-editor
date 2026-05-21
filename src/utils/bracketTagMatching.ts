import { EditorState, StateField, RangeSetBuilder, RangeSet, Range } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, ViewUpdate, GutterMarker, gutter, type DecorationSet } from '@codemirror/view';
import { syntaxTree, matchBrackets } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

class PairMarker extends GutterMarker {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-bracket-marker';
    span.textContent = '◆';
    return span;
  }
}

const pairMarkerInstance = new PairMarker();

const pairMatchMark = Decoration.mark({ class: 'cm-matchingBracket' });

function findTagPair(
  state: EditorState,
  pos: number
): { start: { from: number; to: number }; end: { from: number; to: number } } | null {
  const tree = syntaxTree(state);
  if (!tree) return null;

  const node = tree.resolveInner(pos, 1);

  let tagContainer: SyntaxNode | null = null;
  for (let cur: SyntaxNode | null = node; cur; cur = cur.parent) {
    const name = cur.type.name;
    if (name === 'TagName') {
      tagContainer = cur.parent;
      break;
    }
    if (name === 'OpenTag' || name === 'CloseTag') {
      tagContainer = cur;
      break;
    }
  }

  if (!tagContainer) {
    for (let cur: SyntaxNode | null = node; cur; cur = cur.parent) {
      if (cur.type.name === 'Element') {
        tagContainer = cur;
        break;
      }
    }
  }

  if (!tagContainer) return null;

  const getTagName = (container: SyntaxNode): { from: number; to: number } | null => {
    const child = container.getChild('TagName');
    if (child) return { from: child.from, to: child.to };
    const c = container.cursor();
    if (c.firstChild()) {
      do {
        if (c.type.name === 'TagName') return { from: c.from, to: c.to };
      } while (c.nextSibling());
    }
    return null;
  };

  if (tagContainer.type.name === 'Element') {
    const line = state.doc.lineAt(pos);
    let nearestTag: SyntaxNode | null = null;
    let nearestDist = Infinity;

    const stack: SyntaxNode[] = [tagContainer];
    while (stack.length) {
      const current = stack.pop()!;
      if (nearestDist === 0) break;

      if (current.type.name === 'OpenTag' || current.type.name === 'CloseTag') {
        const tagLine = state.doc.lineAt(current.from);
        if (tagLine.number === line.number) {
          const dist = Math.min(Math.abs(current.from - pos), Math.abs(current.to - pos));
          if (dist < nearestDist && dist <= 200) {
            nearestDist = dist;
            nearestTag = current;
          }
        }
      }

      const c = current.cursor();
      if (c.firstChild()) {
        do {
          stack.push(c.node);
        } while (c.nextSibling());
      }
    }

    if (nearestTag) {
      tagContainer = nearestTag;
    } else {
      return null;
    }
  }

  const currentTagName = getTagName(tagContainer);
  if (!currentTagName) return null;

  const element = tagContainer.parent;
  if (!element || element.type.name !== 'Element') return null;

  const isOpen = tagContainer.type.name === 'OpenTag';
  let matchTagName: { from: number; to: number } | null = null;

  if (isOpen) {
    const c = element.cursor();
    if (c.firstChild()) {
      let foundSelf = false;
      do {
        if (c.from === tagContainer.from && c.to === tagContainer.to) {
          foundSelf = true;
          continue;
        }
        if (foundSelf && c.type.name === 'CloseTag') {
          matchTagName = getTagName(c.node);
          break;
        }
      } while (c.nextSibling());
    }
  } else {
    const c = element.cursor();
    if (c.lastChild()) {
      let foundSelf = false;
      do {
        if (c.from === tagContainer.from && c.to === tagContainer.to) {
          foundSelf = true;
          continue;
        }
        if (foundSelf && c.type.name === 'OpenTag') {
          matchTagName = getTagName(c.node);
          break;
        }
      } while (c.prevSibling());
    }
  }

  if (!matchTagName) return null;
  return { start: currentTagName, end: matchTagName };
}

/** Search near pos (skipping whitespace) for the closest bracket on the same line. */
function findBracketNear(
  state: EditorState,
  pos: number
): { pos: number; dir: -1 | 1 } | null {
  const openBrackets = '([{<';
  const closeBrackets = ')]}>';
  const line = state.doc.lineAt(pos);

  for (let p = pos - 1; p >= line.from; p--) {
    const ch = state.doc.sliceString(p, p + 1);
    if (openBrackets.includes(ch)) return { pos: p, dir: 1 };
    if (closeBrackets.includes(ch)) return { pos: p + 1, dir: -1 };
    if (ch !== ' ' && ch !== '\t') break;
  }

  for (let p = pos; p < line.to && p < state.doc.length; p++) {
    const ch = state.doc.sliceString(p, p + 1);
    if (openBrackets.includes(ch)) return { pos: p, dir: 1 };
    if (closeBrackets.includes(ch)) return { pos: p + 1, dir: -1 };
    if (ch !== ' ' && ch !== '\t') break;
  }

  return null;
}

function computeMarkedLines(state: EditorState, cursorPos: number): readonly number[] {
  const lines = new Set<number>();

  const tagMatch = findTagPair(state, cursorPos);
  if (tagMatch) {
    lines.add(state.doc.lineAt(tagMatch.start.from).number);
    lines.add(state.doc.lineAt(tagMatch.end.from).number);
    return Object.freeze([...lines].sort((a, b) => a - b));
  }

  const config = { brackets: '()[]{}<>' as string };
  let match = null;

  const bracketNear = findBracketNear(state, cursorPos);
  if (bracketNear) {
    match = matchBrackets(state, bracketNear.pos, bracketNear.dir, config);
  }

  if (match && match.matched && match.end) {
    lines.add(state.doc.lineAt(match.start.from).number);
    lines.add(state.doc.lineAt(match.end.from).number);
  }

  return Object.freeze([...lines].sort((a, b) => a - b));
}

/** StateField that stores a RangeSet of gutter markers for bracket/tag pair matches. */
const markedLinesField = StateField.define<RangeSet<GutterMarker>>({
  create(state) {
    const cursorPos = state.selection.main.head;
    const lines = computeMarkedLines(state, cursorPos);
    const builder = new RangeSetBuilder<GutterMarker>();
    for (const lineNo of lines) {
      const line = state.doc.line(lineNo);
      builder.add(line.from, line.to, pairMarkerInstance);
    }
    return builder.finish();
  },
  update(value, tr) {
    if (!tr.docChanged && tr.startState.selection.eq(tr.state.selection)) return value;
    const cursorPos = tr.state.selection.main.head;
    const lines = computeMarkedLines(tr.state, cursorPos);
    const builder = new RangeSetBuilder<GutterMarker>();
    for (const lineNo of lines) {
      const line = tr.state.doc.line(lineNo);
      builder.add(line.from, line.to, pairMarkerInstance);
    }
    return builder.finish();
  },
});

/** Gutter that shows ◆ on lines containing a bracket/tag pair match. */
const pairGutter = gutter({
  class: 'cm-pair-gutter',
  markers(view) {
    return view.state.field(markedLinesField);
  },
  initialSpacer() {
    return pairMarkerInstance;
  },
});

/** ViewPlugin that highlights tag names for HTML/XML, and brackets for plain text. */
const bracketAndTagMatcher = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.compute(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = this.compute(update.view);
      }
    }
    compute(view: EditorView) {
      const decorations: Range<Decoration>[] = [];
      for (const range of view.state.selection.ranges) {
        if (!range.empty) continue;

        const tagMatch = findTagPair(view.state, range.head);
        if (tagMatch) {
          decorations.push(pairMatchMark.range(tagMatch.start.from, tagMatch.start.to));
          decorations.push(pairMatchMark.range(tagMatch.end.from, tagMatch.end.to));
          continue;
        }

        const config = { brackets: '()[]{}<>' as string };
        let match = null;

        const bracketNear = findBracketNear(view.state, range.head);
        if (bracketNear) {
          match = matchBrackets(view.state, bracketNear.pos, bracketNear.dir, config);
        }

        if (match && match.end) {
          decorations.push(pairMatchMark.range(match.start.from, match.start.to));
          decorations.push(pairMatchMark.range(match.end.from, match.end.to));
        }
      }
      return Decoration.set(decorations, true);
    }
  },
  { decorations: (v: { decorations: DecorationSet }) => v.decorations }
);

export { markedLinesField, pairGutter, bracketAndTagMatcher };
