import { EditorState } from '@codemirror/state';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './useEditorStore';
import { getEditorContent, setEditorState } from './useEditorStatePool';

const desktopMocks = vi.hoisted(() => ({
  readFileMeta: vi.fn(),
  readFileAuto: vi.fn(),
}));

vi.mock('../platform/desktop', () => ({
  desktopApi: {
    isDesktop: () => true,
    platform: () => 'win32',
    readFileMeta: desktopMocks.readFileMeta,
    readFileAuto: desktopMocks.readFileAuto,
  },
}));

import { useFileOpener } from './useFileOpener';

describe('useFileOpener progressive loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    desktopMocks.readFileMeta.mockReset();
    desktopMocks.readFileAuto.mockReset();
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      activeGroup1TabId: null,
      activeGroup2TabId: null,
      splitMode: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not replace user edits with a late full-file read', async () => {
    let resolveFullRead!: (value: { text: string; encoding: string }) => void;
    desktopMocks.readFileMeta.mockResolvedValue({
      file_size: 3 * 1024 * 1024,
      encoding: 'UTF-8',
      total_lines: 1,
      first_chunk: 'partial',
    });
    desktopMocks.readFileAuto.mockReturnValue(new Promise((resolve) => {
      resolveFullRead = resolve;
    }));

    const { result } = renderHook(() => useFileOpener());
    await act(async () => {
      await result.current('C:\\tmp\\large.txt');
    });

    const [tab] = useEditorStore.getState().tabs;
    setEditorState(tab.id, EditorState.create({ doc: 'partial' }));
    act(() => {
      vi.advanceTimersByTime(100);
    });

    setEditorState(tab.id, EditorState.create({ doc: 'partial + user edit' }));
    useEditorStore.getState().markTabDirty(tab.id, true);
    await act(async () => {
      resolveFullRead({ text: 'complete file from disk', encoding: 'UTF-8' });
      await Promise.resolve();
    });

    expect(getEditorContent(tab.id)).toBe('partial + user edit');
    expect(useEditorStore.getState().tabs[0].isDirty).toBe(true);
  });
});
