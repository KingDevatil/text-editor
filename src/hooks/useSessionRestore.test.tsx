import React from 'react';
import { EditorState } from '@codemirror/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useEditorStore } from './useEditorStore';
import { useSessionRestore } from './useSessionRestore';
import { getEditorContent, setEditorState } from './useEditorStatePool';

const SESSION_KEY = 'te2-session';

function RestoreHarness() {
  useSessionRestore();
  return null;
}

describe('useSessionRestore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      activeGroup1TabId: null,
      activeGroup2TabId: null,
      splitMode: false,
    });
  });

  afterEach(() => {
    delete window.electronDesktop;
    vi.restoreAllMocks();
  });

  it('drops session tabs whose files cannot be restored', async () => {
    const missingPath = 'C:\\tmp\\missing.txt';
    const existingPath = 'C:\\tmp\\existing.txt';

    window.electronDesktop = {
      readFileMeta: vi.fn(async (path: string) => {
        if (path === missingPath) {
          throw new Error('ENOENT');
        }
        return {
          file_size: 7,
          encoding: 'UTF-8',
          total_lines: 1,
          first_chunk: 'present',
        };
      }),
      readFileAuto: vi.fn(async (path: string) => {
        if (path === missingPath) {
          throw new Error('ENOENT');
        }
        return { text: 'present', encoding: 'UTF-8' };
      }),
    } as typeof window.electronDesktop;

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      tabs: [
        {
          title: 'missing.txt',
          filePath: missingPath,
          language: 'plaintext',
          encoding: 'UTF-8',
          group: 1,
          scrollTop: 0,
          cursorAnchor: 120,
          cursorHead: 120,
        },
        {
          title: 'existing.txt',
          filePath: existingPath,
          language: 'plaintext',
          encoding: 'UTF-8',
          group: 1,
          scrollTop: 0,
        },
      ],
      activeFilePath: missingPath,
      splitMode: false,
      timestamp: Date.now(),
    }));

    render(<RestoreHarness />);

    await waitFor(() => {
      expect(useEditorStore.getState().tabs).toHaveLength(1);
    });

    const [tab] = useEditorStore.getState().tabs;
    expect(tab.title).toBe('existing.txt');
    expect(tab.filePath).toBe(existingPath);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('does not replace edits made before a progressive restore finishes', async () => {
    const filePath = 'C:\\tmp\\large.txt';
    let finishRead!: (value: { text: string; encoding: string }) => void;
    window.electronDesktop = {
      readFileMeta: vi.fn(async () => ({
        file_size: 3 * 1024 * 1024,
        encoding: 'UTF-8',
        total_lines: 1,
        first_chunk: 'partial',
      })),
      readFileAuto: vi.fn(() => new Promise((resolve) => {
        finishRead = resolve;
      })),
    } as unknown as typeof window.electronDesktop;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      tabs: [{
        title: 'large.txt',
        filePath,
        language: 'plaintext',
        encoding: 'UTF-8',
        group: 1,
        scrollTop: 0,
      }],
      activeFilePath: filePath,
      splitMode: false,
      timestamp: Date.now(),
    }));

    render(<RestoreHarness />);
    await waitFor(() => expect(useEditorStore.getState().tabs).toHaveLength(1));
    const [tab] = useEditorStore.getState().tabs;
    setEditorState(tab.id, EditorState.create({ doc: 'partial + user edit' }));
    useEditorStore.getState().markTabDirty(tab.id, true);

    await act(async () => {
      finishRead({ text: 'complete file from disk', encoding: 'UTF-8' });
      await Promise.resolve();
    });

    expect(getEditorContent(tab.id)).toBe('partial + user edit');
    expect(useEditorStore.getState().tabs[0].isDirty).toBe(true);
  });
});
