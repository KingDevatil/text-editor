import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import JsonFormField from './JsonFormField';
import { parseJsonc } from '../utils/jsoncParser';

function renderArrayField(source: string) {
  const root = parseJsonc(source).root;
  const arrayNode = root?.children.find((child) => child.key === 'arr');
  if (!arrayNode) throw new Error('Missing arr node');

  return render(
    <JsonFormField
      node={arrayNode}
      pathKey="arr"
      issues={[]}
      onEdit={vi.fn()}
      onCopy={vi.fn()}
      onAddLike={vi.fn()}
      onDelete={vi.fn()}
      onAdd={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onEditComment={vi.fn()}
      onEditText={vi.fn()}
      onBatchImport={vi.fn()}
      depth={0}
    />
  );
}

function renderObjectChild(source: string, key: string) {
  const root = parseJsonc(source).root;
  const childNode = root?.children.find((child) => child.key === key);
  if (!childNode) throw new Error(`Missing ${key} node`);

  return render(
    <JsonFormField
      node={childNode}
      pathKey={key}
      issues={[]}
      onEdit={vi.fn()}
      onCopy={vi.fn()}
      onAddLike={vi.fn()}
      onDelete={vi.fn()}
      onAdd={vi.fn()}
      onRename={vi.fn()}
      onMove={vi.fn()}
      onEditComment={vi.fn()}
      onEditText={vi.fn()}
      onBatchImport={vi.fn()}
      depth={0}
    />
  );
}

describe('JsonFormField', () => {
  it('opens the comment editor when double-clicking an array bracket comment', () => {
    renderArrayField(`{
  "arr": [// bracket comment
    { "id": "a" },
    { "id": "b" }
  ]
}`);

    fireEvent.doubleClick(screen.getByText('// bracket comment'));

    expect(screen.getByDisplayValue('bracket comment')).toBeInTheDocument();
  });

  it('places the caret at the end when opening the comment editor', async () => {
    renderArrayField(`{
  "arr": [// bracket comment
    { "id": "a" },
    { "id": "b" }
  ]
}`);

    fireEvent.doubleClick(screen.getByText('// bracket comment'));

    const textarea = screen.getByDisplayValue('bracket comment') as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.selectionStart).toBe('bracket comment'.length);
      expect(textarea.selectionEnd).toBe('bracket comment'.length);
    });
  });

  it('selects a CodeMirror-like word on input double-click', async () => {
    renderObjectChild('{"name":"hello world, again"}', 'name');

    const input = screen.getByDisplayValue('hello world, again') as HTMLInputElement;
    input.setSelectionRange(6, 11);
    fireEvent.doubleClick(input);

    await waitFor(() => {
      expect(input.selectionStart).toBe('hello '.length);
      expect(input.selectionEnd).toBe('hello world'.length);
    });
  });

  it('stops text segment selection at quotes and Chinese commas', async () => {
    renderObjectChild('{"name":"他说“你好，世界”，然后离开"}', 'name');

    const input = screen.getByDisplayValue('他说“你好，世界”，然后离开') as HTMLInputElement;
    input.setSelectionRange(3, 5);
    fireEvent.doubleClick(input);

    await waitFor(() => {
      expect(input.selectionStart).toBe('他说“'.length);
      expect(input.selectionEnd).toBe('他说“你好'.length);
    });
  });
});
