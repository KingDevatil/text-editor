import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import JsonFormPanel from './JsonFormPanel';
import { getActiveView } from '../hooks/useEditorStatePool';
import { undo, redo } from '@codemirror/commands';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  message: vi.fn(),
}));

vi.mock('@codemirror/commands', () => ({
  undo: vi.fn(() => true),
  redo: vi.fn(() => true),
}));

vi.mock('../hooks/useEditorStatePool', () => ({
  subscribeContentChange: vi.fn((_tabId: string, listener: (content: string) => void) => {
    listener('{"name":"demo"}');
    return vi.fn();
  }),
  getActiveView: vi.fn(() => ({ state: {}, dispatch: vi.fn() })),
}));

describe('JsonFormPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveView).mockReturnValue({ state: {}, dispatch: vi.fn() } as never);
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
});
