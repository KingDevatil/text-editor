import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import JsonFormPanel from './JsonFormPanel';
import { getActiveView } from '../hooks/useEditorStatePool';
import { undo, redo } from '@codemirror/commands';

let mockEditorContent = '{"name":"demo"}';
let mockDispatch = vi.fn();

vi.mock('@codemirror/commands', () => ({
  undo: vi.fn(() => true),
  redo: vi.fn(() => true),
}));

vi.mock('../hooks/useEditorStatePool', () => ({
  subscribeContentChange: vi.fn((_tabId: string, listener: (content: string) => void) => {
    listener(mockEditorContent);
    return vi.fn();
  }),
  getActiveView: vi.fn(() => ({ state: { facet: vi.fn(() => '\n') }, dispatch: mockDispatch })),
}));

describe('JsonFormPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditorContent = '{"name":"demo"}';
    mockDispatch = vi.fn();
    vi.mocked(getActiveView).mockReturnValue({ state: { facet: vi.fn(() => '\n') }, dispatch: mockDispatch } as never);
    vi.mocked(undo).mockReturnValue(true);
    vi.mocked(redo).mockReturnValue(true);
  });

  it('forwards Ctrl+Z and redo shortcuts to the active editor when focus is in the form panel', () => {
    render(<JsonFormPanel tabId="tab-form" visible />);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(2);
    expect(getActiveView).toHaveBeenCalledWith('tab-form');
  });

  it('leaves Ctrl+Z inside text inputs for native input undo', async () => {
    render(<JsonFormPanel tabId="tab-form" visible />);

    fireEvent.keyDown(await screen.findByDisplayValue('demo'), { key: 'z', ctrlKey: true });

    expect(undo).not.toHaveBeenCalled();
  });

  it('imports delimited text into an array without replacing the template element', async () => {
    mockEditorContent = `{
  "items": [
    {
      "itemid": 1,
      "count": 10
    }
  ]
}`;
    render(<JsonFormPanel tabId="tab-form" visible />);

    fireEvent.click((await screen.findAllByTitle('导入分隔符文本'))[0]);
    const modalTextareas = screen.getAllByRole('textbox');
    fireEvent.change(modalTextareas[modalTextareas.length - 1], { target: { value: '6,100;7,200' } });
    fireEvent.click(screen.getByText('导入'));

    const dispatched = mockDispatch.mock.calls[0]?.[0];
    expect(dispatched).toBeTruthy();
    const nextText = applyDispatchedChanges(mockEditorContent, dispatched.changes);
    expect(JSON.parse(nextText).items).toEqual([
      { itemid: 1, count: 10 },
      { itemid: 6, count: 100 },
      { itemid: 7, count: 200 },
    ]);
  });
});

function applyDispatchedChanges(
  text: string,
  changes: Array<{ from: number; to: number; insert: string }>
): string {
  return changes
    .slice()
    .sort((a, b) => b.from - a.from)
    .reduce((current, change) => (
      current.slice(0, change.from) + change.insert + current.slice(change.to)
    ), text);
}
