import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFileWatcher } from './useFileWatcher';
import type { EditorTab } from '../types';

const invokeMock = vi.fn(() => Promise.resolve());
let listenCallbacks: Array<(event: { payload: string }) => void> = [];
let unlistenFns: Array<() => void> = [];

const listenMock = vi.fn((_event: string, cb: (event: { payload: string }) => void) => {
  listenCallbacks.push(cb);
  const unlisten = vi.fn();
  unlistenFns.push(unlisten);
  return Promise.resolve(unlisten);
});

const confirmMock = vi.fn(() => Promise.resolve(true));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  listen: (...args: unknown[]) => listenMock(...args),
  isTauri: () => true,
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: (...args: unknown[]) => confirmMock(...args),
}));

const mockTabs: EditorTab[] = [];
const mockMarkTabSaved = vi.fn();
const mockSetTabEncoding = vi.fn();
const mockUpdateEditorContent = vi.fn();

vi.mock('./useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      tabs: mockTabs,
      markTabSaved: mockMarkTabSaved,
      setTabEncoding: mockSetTabEncoding,
    }),
  },
}));

vi.mock('./useEditorStatePool', () => ({
  updateEditorContent: (...args: unknown[]) => mockUpdateEditorContent(...args),
}));

describe('useFileWatcher', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    listenMock.mockClear();
    listenCallbacks.length = 0;
    unlistenFns.length = 0;
    confirmMock.mockClear();
    mockUpdateEditorContent.mockClear();
    mockMarkTabSaved.mockClear();
    mockSetTabEncoding.mockClear();
    mockTabs.length = 0;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'read_file_auto_detect') {
        return Promise.resolve({ text: 'new content', encoding: 'UTF-8' });
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('watches new file paths when tabs change', () => {
    const tab: EditorTab = {
      id: 'tab-1',
      title: 'test.txt',
      language: 'plaintext',
      isDirty: false,
      filePath: '/project/test.txt',
      encoding: 'UTF-8',
    };

    const { rerender } = renderHook(({ tabs }) => useFileWatcher(tabs), {
      initialProps: { tabs: [] as EditorTab[] },
    });

    expect(invokeMock).not.toHaveBeenCalledWith('watch_file', expect.anything);

    rerender({ tabs: [tab] });

    expect(invokeMock).toHaveBeenCalledWith('watch_file', { path: '/project/test.txt' });
  });

  it('unwatches file paths removed from tabs', () => {
    const tab: EditorTab = {
      id: 'tab-1',
      title: 'test.txt',
      language: 'plaintext',
      isDirty: false,
      filePath: '/project/test.txt',
      encoding: 'UTF-8',
    };

    const { rerender } = renderHook(({ tabs }) => useFileWatcher(tabs), {
      initialProps: { tabs: [tab] },
    });

    expect(invokeMock).toHaveBeenCalledWith('watch_file', { path: '/project/test.txt' });
    invokeMock.mockClear();

    rerender({ tabs: [] });

    expect(invokeMock).toHaveBeenCalledWith('unwatch_file', { path: '/project/test.txt' });
  });

  it('does not re-watch already watched paths', () => {
    const tab: EditorTab = {
      id: 'tab-1',
      title: 'test.txt',
      language: 'plaintext',
      isDirty: false,
      filePath: '/project/test.txt',
      encoding: 'UTF-8',
    };

    const { rerender } = renderHook(({ tabs }) => useFileWatcher(tabs), {
      initialProps: { tabs: [tab] },
    });

    invokeMock.mockClear();
    rerender({ tabs: [tab] });

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('reloads content when file-changed event fires for an open tab', async () => {
    const tab: EditorTab = {
      id: 'tab-1',
      title: 'test.txt',
      language: 'plaintext',
      isDirty: false,
      filePath: '/project/test.txt',
      encoding: 'UTF-8',
    };

    mockTabs.length = 0;
    mockTabs.push(tab);
    invokeMock.mockResolvedValueOnce({ text: 'new content', encoding: 'UTF-8' });

    renderHook(({ tabs }) => useFileWatcher(tabs), {
      initialProps: { tabs: [tab] },
    });

    await waitFor(() => expect(listenCallbacks.length).toBeGreaterThan(0));

    listenCallbacks[listenCallbacks.length - 1]({ payload: '/project/test.txt' });

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('read_file_auto_detect', { path: '/project/test.txt' })
    );
    await waitFor(() => expect(mockUpdateEditorContent).toHaveBeenCalledWith('tab-1', 'new content'));
    await waitFor(() => expect(mockMarkTabSaved).toHaveBeenCalledWith('tab-1'));
    await waitFor(() => expect(mockSetTabEncoding).toHaveBeenCalledWith('tab-1', 'UTF-8'));
  });

  it('does nothing when file-changed event fires for a closed tab after confirm', async () => {
    const tab: EditorTab = {
      id: 'tab-1',
      title: 'test.txt',
      language: 'plaintext',
      isDirty: true,
      filePath: '/project/test.txt',
      encoding: 'UTF-8',
    };

    mockTabs.length = 0;
    mockTabs.push(tab);

    let confirmResolve: ((value: boolean) => void) | undefined;
    confirmMock.mockImplementation(() => new Promise((resolve) => {
      confirmResolve = resolve;
    }));

    renderHook(({ tabs }) => useFileWatcher(tabs), {
      initialProps: { tabs: [tab] },
    });

    await waitFor(() => expect(listenCallbacks.length).toBeGreaterThan(0));

    listenCallbacks[listenCallbacks.length - 1]({ payload: '/project/test.txt' });

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());

    // Simulate user closing the tab while confirm dialog is open
    mockTabs.length = 0;

    // User confirms after tab was closed
    confirmResolve?.(true);

    // Allow async handler to continue
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should not attempt to reload because tab no longer exists
    expect(invokeMock).not.toHaveBeenCalledWith('read_file_auto_detect', expect.anything);
    expect(mockUpdateEditorContent).not.toHaveBeenCalled();
  });
});
