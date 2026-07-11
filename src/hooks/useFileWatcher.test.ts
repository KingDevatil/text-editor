import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFileWatcher } from './useFileWatcher';
import type { EditorTab } from '../types';
import type { FileChangeEvent } from '../platform/desktop';

const invokeMock = vi.fn(() => Promise.resolve());
const watchFileMock = vi.fn(() => Promise.resolve());
const unwatchFileMock = vi.fn(() => Promise.resolve());
const listenCallbacks: Array<(change: FileChangeEvent) => void> = [];
const unlistenFns: Array<() => void> = [];

const onFileChangedMock = vi.fn((cb: (change: FileChangeEvent) => void) => {
  listenCallbacks.push(cb);
  const unlisten = vi.fn();
  unlistenFns.push(unlisten);
  return unlisten;
});

vi.mock('../platform/desktop', () => ({
  desktopApi: {
    isDesktop: () => true,
    watchFile: (...args: unknown[]) => watchFileMock(...args),
    unwatchFile: (...args: unknown[]) => unwatchFileMock(...args),
    onFileChanged: (...args: [(change: FileChangeEvent) => void]) => onFileChangedMock(...args),
  },
}));

describe('useFileWatcher', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    watchFileMock.mockClear();
    unwatchFileMock.mockClear();
    onFileChangedMock.mockClear();
    listenCallbacks.length = 0;
    unlistenFns.length = 0;
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

    expect(watchFileMock).not.toHaveBeenCalled();

    rerender({ tabs: [tab] });

    expect(watchFileMock).toHaveBeenCalledWith('/project/test.txt');
  });

  it('unwatches file paths removed from tabs', async () => {
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

    await waitFor(() => expect(watchFileMock).toHaveBeenCalledWith('/project/test.txt'));
    await waitFor(() => expect(watchFileMock).toHaveBeenCalledTimes(1));
    watchFileMock.mockClear();
    unwatchFileMock.mockClear();

    rerender({ tabs: [] });

    await waitFor(() => expect(unwatchFileMock).toHaveBeenCalledWith('/project/test.txt'));
  });

  it('does not re-watch already watched paths', async () => {
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

    await waitFor(() => expect(watchFileMock).toHaveBeenCalledTimes(1));
    watchFileMock.mockClear();
    unwatchFileMock.mockClear();
    rerender({ tabs: [tab] });

    expect(watchFileMock).not.toHaveBeenCalled();
    expect(unwatchFileMock).not.toHaveBeenCalled();
  });

  it('does not invoke watch/unwatch when only tab references change but file paths stay the same', async () => {
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

    await waitFor(() => expect(watchFileMock).toHaveBeenCalledTimes(1));
    // simulate markTabDirty creating a new tab reference with same filePath
    const newTabRef = { ...tab, isDirty: true };
    watchFileMock.mockClear();
    unwatchFileMock.mockClear();
    rerender({ tabs: [newTabRef] });

    expect(watchFileMock).not.toHaveBeenCalled();
    expect(unwatchFileMock).not.toHaveBeenCalled();
  });

  it('calls onFileChanged when file-changed event fires', async () => {
    const tab: EditorTab = {
      id: 'tab-1',
      title: 'test.txt',
      language: 'plaintext',
      isDirty: false,
      filePath: '/project/test.txt',
      encoding: 'UTF-8',
    };

    const onFileChanged = vi.fn();

    renderHook(({ tabs }) => useFileWatcher(tabs, onFileChanged), {
      initialProps: { tabs: [tab] },
    });

    await waitFor(() => expect(listenCallbacks.length).toBeGreaterThan(0));

    listenCallbacks[listenCallbacks.length - 1]({ path: '/project/test.txt', kind: 'change' });

    await waitFor(() => expect(onFileChanged).toHaveBeenCalledWith({ path: '/project/test.txt', kind: 'change' }));
  });

  it('does not call onFileChanged for paths not in current tabs', async () => {
    const tab: EditorTab = {
      id: 'tab-1',
      title: 'test.txt',
      language: 'plaintext',
      isDirty: false,
      filePath: '/project/test.txt',
      encoding: 'UTF-8',
    };

    const onFileChanged = vi.fn();

    renderHook(({ tabs }) => useFileWatcher(tabs, onFileChanged), {
      initialProps: { tabs: [tab] },
    });

    await waitFor(() => expect(listenCallbacks.length).toBeGreaterThan(0));

    listenCallbacks[listenCallbacks.length - 1]({ path: '/project/other.txt', kind: 'unlink' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onFileChanged).not.toHaveBeenCalled();
  });
});
