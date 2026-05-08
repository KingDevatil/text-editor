import { ViewPlugin, ViewUpdate, Decoration, EditorView, type DecorationSet, gutter, GutterMarker } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';

/**
 * Check if a node type name represents an XML/HTML open tag.
 */
function isOpenTag(typeName: string): boolean {
  return typeName === 'StartTag' || typeName === 'Element' || typeName === 'Tag' || typeName === 'OpenTag' || typeName === 'ElementName';
}

/**
 * Check if a node type name represents an XML/HTML close tag.
 */
function isCloseTag(typeName: string): boolean {
  return typeName === 'CloseTag' || typeName === 'EndTag';
}

/**
 * Check if a node type name represents an XML/HTML tag name.
 */
function isTagName(typeName: string): boolean {
  return typeName === 'TagName' || typeName === 'ElementName' || typeName === 'StartTagName' || typeName === 'EndTagName';
}

interface TagInfo {
  from: number;
  to: number;
  name: string;
  isOpen: boolean;
}

/**
 * A ViewPlugin that highlights matching XML/HTML tag pairs with an underline.
 * Also highlights matching bracket pairs: {} [] () <>.
 */
export const tagMatchingHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const state = view.state;
      const selection = state.selection.main;
      const cursorPos = selection.head;

      const tree = syntaxTree(state);
      if (!tree) return builder.finish();

      // Try to find tag name at cursor position
      const foundTags: TagInfo[] = [];

      tree.iterate({
        from: Math.max(0, cursorPos - 50),
        to: Math.min(state.doc.length, cursorPos + 50),
        enter: (node) => {
          if (foundTags.length > 0) return false;

          const typeName = node.name;
          if (isTagName(typeName) || typeName.includes('Tag') || typeName.includes('Element')) {
            // Check if cursor is near this node
            if (node.from <= cursorPos && node.to >= cursorPos) {
              const isOpen = !isCloseTag(typeName) && !typeName.includes('Close');
              foundTags.push({
                from: node.from,
                to: node.to,
                name: state.doc.sliceString(node.from, node.to),
                isOpen,
              });
              return false;
            }
          }
          return true;
        },
      });

      if (foundTags.length > 0) {
        const tag = foundTags[0];
        // Highlight the current tag
        const deco = Decoration.mark({
          class: 'cm-matching-tag',
          attributes: { 'data-tag-name': tag.name },
        });
        builder.add(tag.from, tag.to, deco);

        // Find the matching tag
        const match = this.findMatchingTag(tree, state, tag);
        if (match) {
          const matchDeco = Decoration.mark({
            class: 'cm-matching-tag cm-matching-tag-pair',
            attributes: { 'data-tag-name': match.name },
          });
          builder.add(match.from, match.to, matchDeco);
        }
      }

      return builder.finish();
    }

    findMatchingTag(
      tree: any,
      state: any,
      currentTag: TagInfo
    ): TagInfo | null {
      const tagName = currentTag.name;
      let depth = 0;
      let found = false;
      let result: TagInfo | null = null;

      if (currentTag.isOpen) {
        // Search forward for closing tag
        tree.iterate({
          from: currentTag.to,
          to: state.doc.length,
          enter: (node: any) => {
            if (found) return false;

            const typeName = node.name;

            if (isOpenTag(typeName) || (typeName.includes('Tag') && !isCloseTag(typeName) && !typeName.includes('Close'))) {
              // Check if this is the same tag name
              const innerName = this.extractTagName(state, node);
              if (innerName === tagName) {
                depth++;
              }
            } else if (isCloseTag(typeName) || typeName.includes('Close')) {
              const innerName = this.extractTagName(state, node);
              if (innerName === tagName) {
                if (depth === 0) {
                  found = true;
                  result = {
                    from: node.from,
                    to: node.to,
                    name: tagName,
                    isOpen: false,
                  };
                  return false;
                }
                depth--;
              }
            }
            return true;
          },
        });
      } else {
        // Search backward for opening tag
        const cursor = tree.cursor();
        cursor.moveTo(currentTag.from, -1);

        while (cursor.prev()) {
          if (found) break;

          const typeName = cursor.name;
          const innerName = this.extractTagName(state, cursor);

          if (innerName === tagName) {
            if (isCloseTag(typeName) || typeName.includes('Close')) {
              depth++;
            } else if (isOpenTag(typeName) || (typeName.includes('Tag') && !typeName.includes('Close'))) {
              if (depth === 0) {
                found = true;
                result = {
                  from: cursor.from,
                  to: cursor.to,
                  name: tagName,
                  isOpen: true,
                };
                break;
              }
              depth--;
            }
          }
        }
      }

      return result;
    }

    extractTagName(state: any, node: any): string {
      // Try to find the tag name inside the node
      const text = state.doc.sliceString(node.from, node.to);
      const match = text.match(/\/?([a-zA-Z_][a-zA-Z0-9_\-:]*)/);
      return match ? match[1] : text;
    }
  },
  { decorations: (v) => v.decorations }
);

export const TAG_MATCHING_THEME = EditorView.theme({
  '.cm-matching-tag': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--te-primary)',
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
  },
  '.cm-matching-tag-pair': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--te-primary)',
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
    opacity: '0.8',
  },
});

class PairMarker extends GutterMarker {
  constructor(readonly tagName: string) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-pair-marker';
    span.title = `成对标签: ${this.tagName}`;
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

/**
 * A gutter that shows a diamond marker on lines containing matching tag pairs.
 */
export const pairMarkerGutter = [
  TAG_MATCHING_THEME,
  tagMatchingHighlight,
  gutter({
    class: 'cm-pair-marker-gutter',
    lineMarker(view, line) {
      const state = view.state;
      const tree = syntaxTree(state);
      if (!tree) return null;

      let hasPair = false;
      let tagName = '';

      tree.iterate({
        from: line.from,
        to: line.to,
        enter: (node) => {
          const typeName = node.name;
          if (isTagName(typeName) || typeName.includes('Tag') || typeName.includes('Element')) {
            hasPair = true;
            tagName = state.doc.sliceString(node.from, node.to);
            return false;
          }
          return true;
        },
      });

      if (hasPair) {
        return new PairMarker(tagName);
      }
      return null;
    },
    initialSpacer() {
      return new PairMarker('');
    },
  }),
];
