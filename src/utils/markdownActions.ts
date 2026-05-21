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

export function executeMarkdownAction(view: EditorView, action: MarkdownAction) {
  const state = view.state;
  const { from, to } = state.selection.main;
  const hasSelection = from !== to;

  const changes: { from: number; to: number; insert: string }[] = [];
  let selection = state.selection.main;

  switch (action) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = parseInt(action[1]);
      changes.push(setHeadingLevel(state, level));
      break;
    }

    case 'bold': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        changes.push({ from, to, insert: `**${text}**` });
        selection = EditorSelection.cursor(to);
      } else {
        changes.push({ from, to, insert: '**粗体文本**' });
      }
      break;
    }

    case 'italic': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        changes.push({ from, to, insert: `*${text}*` });
        selection = EditorSelection.cursor(to);
      } else {
        changes.push({ from, to, insert: '*斜体文本*' });
      }
      break;
    }

    case 'strikethrough': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        changes.push({ from, to, insert: `~~${text}~~` });
        selection = EditorSelection.cursor(to);
      } else {
        changes.push({ from, to, insert: '~~删除线文本~~' });
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
        changes.push({ from, to, insert: `\`${text}\`` });
        selection = EditorSelection.cursor(to);
      } else {
        changes.push({ from, to, insert: '`行内代码`' });
      }
      break;
    }

    case 'codeBlock': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        changes.push({ from, to, insert: `\`\`\`\n${text}\n\`\`\`` });
        selection = EditorSelection.cursor(to);
      } else {
        changes.push({ from, to, insert: '```\n\n```' });
      }
      break;
    }

    case 'link': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        changes.push({ from, to, insert: `[${text}](url)` });
        selection = EditorSelection.cursor(to);
      } else {
        changes.push({ from, to, insert: '[链接文本](url)' });
      }
      break;
    }

    case 'image': {
      if (hasSelection) {
        const text = state.doc.sliceString(from, to);
        changes.push({ from, to, insert: `![${text}](url)` });
        selection = EditorSelection.cursor(to);
      } else {
        changes.push({ from, to, insert: '![图片描述](url)' });
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
      changes.push({ from, to, insert: table });
      break;
    }

    case 'horizontalRule': {
      changes.push({ from, to, insert: '\n---\n' });
      break;
    }
  }

  if (changes.length > 0) {
    view.dispatch({ changes, selection });
    view.focus();
  }
}
