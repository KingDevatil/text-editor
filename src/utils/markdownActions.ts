import { EditorView } from '@codemirror/view';
import { EditorState, EditorSelection } from '@codemirror/state';

export type MarkdownAction =
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  | 'bold' | 'italic' | 'strikethrough'
  | 'quote' | 'inlineCode' | 'codeBlock'
  | 'link' | 'image'
  | 'unorderedList' | 'orderedList' | 'taskList'
  | 'table' | 'horizontalRule';

function setHeadingLevel(state: EditorState, level: number) {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trimStart();
  const match = trimmed.match(/^(#+) /);
  const prefix = '#'.repeat(level) + ' ';

  if (match) {
    return { from: line.from + leading, to: line.from + leading + match[0].length, insert: prefix };
  }
  return { from: line.from + leading, to: line.from + leading, insert: prefix };
}

function toggleLinePrefix(state: EditorState, prefix: string) {
  const { from, to } = state.selection.main;
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(to);
  const changes: { from: number; to: number; insert: string }[] = [];

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = state.doc.line(i);
    const text = line.text;
    const leading = text.length - text.trimStart().length;
    const trimmed = text.trimStart();

    if (trimmed.startsWith(prefix)) {
      changes.push({ from: line.from + leading, to: line.from + leading + prefix.length, insert: '' });
    } else {
      changes.push({ from: line.from + leading, to: line.from + leading, insert: prefix });
    }
  }

  return changes;
}

/**
 * Compute the cursor position in the new document after a change that
 * replaces the range [from..to] with `insert`.
 */
function newCursorAfter(change: { from: number; to: number; insert: string }): number {
  return change.from + change.insert.length;
}

function placeholderMarker(
  change: { from: number; to: number; insert: string },
  prefixLen: number,
  placeholderLen: number,
): EditorSelection {
  const start = change.from + prefixLen;
  return EditorSelection.single(start, start + placeholderLen);
}

export function executeMarkdownAction(view: EditorView, action: MarkdownAction) {
  const state = view.state;
  const { from, to } = state.selection.main;
  const hasSelection = from !== to;

  const changes: { from: number; to: number; insert: string }[] = [];
  // undefined → let CodeMirror map selection through changes (for toggle ops).
  let selection: EditorSelection | undefined;

  switch (action) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = parseInt(action[1]);
      const ch = setHeadingLevel(state, level);
      changes.push(ch);
      selection = EditorSelection.single(newCursorAfter(ch));
      break;
    }

    case 'bold': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        const ch = { from, to, insert: `**${text}**` };
        changes.push(ch);
        selection = EditorSelection.single(newCursorAfter(ch));
      } else {
        const ch = { from, to, insert: '**粗体文本**' };
        changes.push(ch);
        selection = placeholderMarker(ch, 2, 4);
      }
      break;
    }

    case 'italic': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        const ch = { from, to, insert: `*${text}*` };
        changes.push(ch);
        selection = EditorSelection.single(newCursorAfter(ch));
      } else {
        const ch = { from, to, insert: '*斜体文本*' };
        changes.push(ch);
        selection = placeholderMarker(ch, 1, 4);
      }
      break;
    }

    case 'strikethrough': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        const ch = { from, to, insert: `~~${text}~~` };
        changes.push(ch);
        selection = EditorSelection.single(newCursorAfter(ch));
      } else {
        const ch = { from, to, insert: '~~删除线文本~~' };
        changes.push(ch);
        selection = placeholderMarker(ch, 2, 5);
      }
      break;
    }

    case 'quote': {
      changes.push(...toggleLinePrefix(state, '> '));
      break;
    }

    case 'inlineCode': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        const ch = { from, to, insert: `\`${text}\`` };
        changes.push(ch);
        selection = EditorSelection.single(newCursorAfter(ch));
      } else {
        const ch = { from, to, insert: '`行内代码`' };
        changes.push(ch);
        selection = placeholderMarker(ch, 1, 4);
      }
      break;
    }

    case 'codeBlock': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        const ch = { from, to, insert: `\`\`\`\n${text}\n\`\`\`` };
        changes.push(ch);
        selection = EditorSelection.single(newCursorAfter(ch));
      } else {
        const ch = { from, to, insert: '```\n\n```' };
        changes.push(ch);
        // Place cursor on the blank line between opening and closing ```
        selection = EditorSelection.single(from + 4);
      }
      break;
    }

    case 'link': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        const ch = { from, to, insert: `[${text}](url)` };
        changes.push(ch);
        selection = EditorSelection.single(newCursorAfter(ch));
      } else {
        const ch = { from, to, insert: '[链接文本](url)' };
        changes.push(ch);
        selection = placeholderMarker(ch, 1, 4);
      }
      break;
    }

    case 'image': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        const ch = { from, to, insert: `![${text}](url)` };
        changes.push(ch);
        selection = EditorSelection.single(newCursorAfter(ch));
      } else {
        const ch = { from, to, insert: '![图片描述](url)' };
        changes.push(ch);
        selection = placeholderMarker(ch, 2, 4);
      }
      break;
    }

    case 'unorderedList': {
      changes.push(...toggleLinePrefix(state, '- '));
      break;
    }

    case 'orderedList': {
      changes.push(...toggleLinePrefix(state, '1. '));
      break;
    }

    case 'taskList': {
      changes.push(...toggleLinePrefix(state, '- [ ] '));
      break;
    }

    case 'table': {
      const table = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |';
      const ch = { from, to, insert: table };
      changes.push(ch);
      selection = EditorSelection.single(newCursorAfter(ch));
      break;
    }

    case 'horizontalRule': {
      const ch = { from, to, insert: '\n---\n' };
      changes.push(ch);
      selection = EditorSelection.single(newCursorAfter(ch));
      break;
    }
  }

  if (changes.length > 0) {
    const spec: { changes: typeof changes; selection?: EditorSelection } = { changes };
    if (selection !== undefined) spec.selection = selection;
    view.dispatch(spec);
    view.focus();
  }
}
