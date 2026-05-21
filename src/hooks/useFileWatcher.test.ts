import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFileWatcher } from './useFileWatcher';
import type { EditorTab } from '../types';

const invokeMock = vi.fn(() => Promise.resolve());
const listenCallbacks: Array<(event: { payload: string }) => void> = [];
const unlistenFns: Array<() => void> = [];

const listenMock = vi.fn((_event: string, cb: (event: { payload: string }) => void) => {
  listenCallbacks.push(cb);
  const unlisten = vi.fn();
  unlistenFns.push(unlisten);
  return Promise.resolve(unlisten);
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => true,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

describe('useFileWatcher', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    listenMock.mockClear();
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

  it('does not invoke watch/unwatch when only tab references change but file paths stay the same', () => {
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

    // simulate markTabDirty creating a new tab reference with same filePath
    const newTabRef = { ...tab, isDirty: true };
    invokeMock.mockClear();
    rerender({ tabs: [newTabRef] });

    expect(invokeMock).not.toHaveBeenCalled();
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

    listenCallbacks[listenCallbacks.length - 1]({ payload: '/project/test.txt' });

    await waitFor(() => expect(onFileChanged).toHaveBeenCalledWith('/project/test.txt'));
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

    listenCallbacks[listenCallbacks.length - 1]({ payload: '/project/other.txt' });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(onFileChanged).not.toHaveBeenCalled();
  });
});
