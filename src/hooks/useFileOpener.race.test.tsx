import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './useEditorStore';
import { getEditorContent, setActiveView, setEditorState } from './useEditorStatePool';

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

  it('keeps a progressive tab in loading state until the full read finishes', async () => {
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

    expect(useEditorStore.getState().tabs[0].loadState).toBe('loading');
    expect(useEditorStore.getState().tabs[0].isLargeFile).toBe(true);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      resolveFullRead({ text: 'complete file from disk', encoding: 'UTF-8' });
      await Promise.resolve();
    });

    expect(useEditorStore.getState().tabs[0].loadState).toBe('ready');
  });

  it('finishes an active progressive editor by extending its preview', async () => {
    const preview = 'header\nfirst chunk\n';
    const fullContent = `${preview}remaining content\n`;
    desktopMocks.readFileMeta.mockResolvedValue({
      file_size: 3 * 1024 * 1024,
      encoding: 'UTF-8',
      total_lines: 2,
      first_chunk: preview,
    });
    desktopMocks.readFileAuto.mockResolvedValue({ text: fullContent, encoding: 'UTF-8' });

    const { result } = renderHook(() => useFileOpener());
    await act(async () => {
      await result.current('C:\\tmp\\large.xml');
    });

    const [tab] = useEditorStore.getState().tabs;
    const changes: Array<{ fromA: number; toA: number }> = [];
    const view = new EditorView({
      parent: document.createElement('div'),
      state: EditorState.create({
        doc: preview,
        extensions: EditorView.updateListener.of((update) => {
          update.changes.iterChanges((fromA, toA) => changes.push({ fromA, toA }));
        }),
      }),
    });
    setEditorState(tab.id, view.state);
    setActiveView(tab.id, view);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getEditorContent(tab.id)).toBe(fullContent);
    expect(changes).toEqual([{ fromA: preview.length, toA: preview.length }]);
    expect(useEditorStore.getState().tabs[0].loadState).toBe('ready');

    setActiveView(tab.id, null);
    view.destroy();
  });

  it('deduplicates concurrent opens of the same file', async () => {
    desktopMocks.readFileMeta.mockResolvedValue({
      file_size: 12,
      encoding: 'UTF-8',
      total_lines: 1,
      first_chunk: 'same content',
    });
    desktopMocks.readFileAuto.mockResolvedValue({ text: 'same content', encoding: 'UTF-8' });

    const { result } = renderHook(() => useFileOpener());
    await act(async () => {
      await Promise.all([
        result.current('C:\\tmp\\same.txt'),
        result.current('C:\\tmp\\same.txt'),
      ]);
    });

    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().tabs[0].filePath).toBe('C:\\tmp\\same.txt');
  });
});
