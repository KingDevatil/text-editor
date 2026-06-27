import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useEditorStore } from './useEditorStore';
import { useSessionRestore } from './useSessionRestore';

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
});
