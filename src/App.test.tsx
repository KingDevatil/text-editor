import React from 'react';
import { EditorState } from '@codemirror/state';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { useEditorStore } from './hooks/useEditorStore';
import { useUIStore } from './hooks/useUIStore';
import { getEditorContent, setEditorState } from './hooks/useEditorStatePool';

// Mock CodeMirror-heavy child components to keep the test lightweight
vi.mock('./components/CmEditor', () => ({
  default: () => <div data-testid="cm-editor">Editor</div>,
}));
vi.mock('./components/DiffEditor', () => ({
  default: () => <div data-testid="diff-editor">Diff</div>,
}));
vi.mock('./components/MarkdownPreview', () => ({
  default: () => <div data-testid="markdown-preview">Preview</div>,
}));
vi.mock('./components/HtmlPreview', () => ({
  default: () => <div data-testid="html-preview">Preview</div>,
}));
vi.mock('./components/MarkdownReader', () => ({
  default: () => <div data-testid="markdown-reader">Reader</div>,
}));
vi.mock('./components/HtmlReader', () => ({
  default: () => <div data-testid="html-reader">Reader</div>,
}));
vi.mock('./components/Minimap', () => ({
  default: () => null,
}));

describe('App', () => {
  beforeEach(() => {
    // localStorage mock in jsdom may not support clear(); reset manually if needed
    delete window.electronDesktop;
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      activeGroup1TabId: null,
      activeGroup2TabId: null,
      splitMode: false,
    });
    useUIStore.setState({
      previewVisible: false,
      previewFullScreen: false,
    });
  });

  it('renders the app shell', () => {
    render(<App />);
    expect(document.querySelector('.flex.flex-col.h-screen')).toBeInTheDocument();
  });

  it('shows empty state when no tabs are open', () => {
    render(<App />);
    expect(screen.getByText(/没有打开的文件/)).toBeInTheDocument();
  });
  it('binds a new desktop tab to the chosen file path after saving', async () => {
    const savedPath = 'C:\\tmp\\saved-note.txt';
    const writeFile = vi.fn(async () => {});
    window.electronDesktop = {
      saveFileDialog: vi.fn(async () => savedPath),
      writeFile,
      getPendingFiles: vi.fn(async () => []),
      rendererReady: vi.fn(async () => {}),
      onOpenFile: vi.fn(() => () => {}),
      onFileChanged: vi.fn(() => () => {}),
      onDragDropEvent: vi.fn(async () => () => {}),
      watchFile: vi.fn(async () => {}),
      unwatchFile: vi.fn(async () => {}),
    } as unknown as typeof window.electronDesktop;

    const tab = useEditorStore.getState().createTab('Untitled');
    setEditorState(tab.id, EditorState.create({ doc: 'hello from temp' }));

    render(<App />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith(savedPath, 'hello from temp', 'UTF-8');
    });

    const savedTab = useEditorStore.getState().tabs.find((t) => t.id === tab.id);
    expect(savedTab?.title).toBe('saved-note.txt');
    expect(savedTab?.filePath).toBe(savedPath);
    expect(savedTab?.isDirty).toBe(false);
  });

  it('does not mark newer edits as saved when a desktop write finishes', async () => {
    let finishWrite!: () => void;
    const writeFile = vi.fn(() => new Promise<void>((resolve) => {
      finishWrite = resolve;
    }));
    const watchFile = vi.fn(async () => {});
    window.electronDesktop = {
      platform: 'win32',
      writeFile,
      getPendingFiles: vi.fn(async () => []),
      rendererReady: vi.fn(async () => {}),
      onOpenFile: vi.fn(() => () => {}),
      onFileChanged: vi.fn(() => () => {}),
      onDragDropEvent: vi.fn(async () => () => {}),
      watchFile,
      unwatchFile: vi.fn(async () => {}),
    } as unknown as typeof window.electronDesktop;

    const tab = useEditorStore.getState().createTab('note.txt', 'plaintext', 'C:\\tmp\\note.txt');
    setEditorState(tab.id, EditorState.create({ doc: 'saved snapshot' }));
    useEditorStore.getState().markTabDirty(tab.id, true);

    render(<App />);
    watchFile.mockClear();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(writeFile).toHaveBeenCalledWith('C:\\tmp\\note.txt', 'saved snapshot', 'UTF-8'));

    await act(async () => {
      setEditorState(tab.id, EditorState.create({ doc: 'newer edit' }));
      useEditorStore.getState().markTabDirty(tab.id, true);
      finishWrite();
      await Promise.resolve();
    });

    await waitFor(() => expect(watchFile).toHaveBeenCalledWith('C:\\tmp\\note.txt'));
    expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(true);
  });

  it('queues a second save for the latest tab content', async () => {
    const finishWrites: Array<() => void> = [];
    const writeFile = vi.fn(() => new Promise<void>((resolve) => {
      finishWrites.push(resolve);
    }));
    window.electronDesktop = {
      platform: 'win32',
      writeFile,
      getPendingFiles: vi.fn(async () => []),
      rendererReady: vi.fn(async () => {}),
      onOpenFile: vi.fn(() => () => {}),
      onFileChanged: vi.fn(() => () => {}),
      onDragDropEvent: vi.fn(async () => () => {}),
      watchFile: vi.fn(async () => {}),
      unwatchFile: vi.fn(async () => {}),
    } as unknown as typeof window.electronDesktop;

    const tab = useEditorStore.getState().createTab('queued.txt', 'plaintext', 'C:\\tmp\\queued.txt');
    setEditorState(tab.id, EditorState.create({ doc: 'first snapshot' }));
    useEditorStore.getState().markTabDirty(tab.id, true);
    render(<App />);

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));

    await act(async () => {
      setEditorState(tab.id, EditorState.create({ doc: 'latest snapshot' }));
      useEditorStore.getState().markTabDirty(tab.id, true);
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      finishWrites[0]();
      await Promise.resolve();
    });

    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(2));
    expect(writeFile).toHaveBeenLastCalledWith('C:\\tmp\\queued.txt', 'latest snapshot', 'UTF-8');

    await act(async () => {
      finishWrites[1]();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(false);
    });
  });

  it('does not clear dirty when line-ending metadata changes during a save', async () => {
    let finishWrite!: () => void;
    window.electronDesktop = {
      platform: 'win32',
      writeFile: vi.fn(() => new Promise<void>((resolve) => {
        finishWrite = resolve;
      })),
      getPendingFiles: vi.fn(async () => []),
      rendererReady: vi.fn(async () => {}),
      onOpenFile: vi.fn(() => () => {}),
      onFileChanged: vi.fn(() => () => {}),
      onDragDropEvent: vi.fn(async () => () => {}),
      watchFile: vi.fn(async () => {}),
      unwatchFile: vi.fn(async () => {}),
    } as unknown as typeof window.electronDesktop;

    const tab = useEditorStore.getState().createTab('ending.txt', 'plaintext', 'C:\\tmp\\ending.txt');
    setEditorState(tab.id, EditorState.create({ doc: 'same content' }));
    useEditorStore.getState().markTabDirty(tab.id, true);
    render(<App />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(finishWrite).toBeTypeOf('function'));

    await act(async () => {
      useEditorStore.getState().setTabLineEnding(tab.id, 'CRLF');
      useEditorStore.getState().markTabDirty(tab.id, true);
      finishWrite();
      await Promise.resolve();
    });

    expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(true);
  });

  it('marks a tab dirty when its file is deleted externally', async () => {
    let fileChangedHandler!: (change: { path: string; kind: 'change' | 'unlink' }) => void;
    window.electronDesktop = {
      platform: 'win32',
      getPendingFiles: vi.fn(async () => []),
      rendererReady: vi.fn(async () => {}),
      onOpenFile: vi.fn(() => () => {}),
      onFileChanged: vi.fn((handler) => {
        fileChangedHandler = handler;
        return () => {};
      }),
      onDragDropEvent: vi.fn(async () => () => {}),
      watchFile: vi.fn(async () => {}),
      unwatchFile: vi.fn(async () => {}),
    } as unknown as typeof window.electronDesktop;

    const tab = useEditorStore.getState().createTab('deleted.txt', 'plaintext', 'C:\\tmp\\deleted.txt');
    setEditorState(tab.id, EditorState.create({ doc: 'recoverable content' }));
    render(<App />);
    await waitFor(() => expect(fileChangedHandler).toBeTypeOf('function'));

    await act(async () => {
      fileChangedHandler({ path: 'C:\\tmp\\deleted.txt', kind: 'unlink' });
    });

    expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(true);
  });

  it('does not overwrite edits made while an external change is being read', async () => {
    let fileChangedHandler!: (change: { path: string; kind: 'change' | 'unlink' }) => Promise<void> | void;
    let finishRead!: (value: { text: string; encoding: string }) => void;
    window.electronDesktop = {
      platform: 'win32',
      readFileAuto: vi.fn(() => new Promise((resolve) => {
        finishRead = resolve;
      })),
      getPendingFiles: vi.fn(async () => []),
      rendererReady: vi.fn(async () => {}),
      onOpenFile: vi.fn(() => () => {}),
      onFileChanged: vi.fn((handler) => {
        fileChangedHandler = handler;
        return () => {};
      }),
      onDragDropEvent: vi.fn(async () => () => {}),
      watchFile: vi.fn(async () => {}),
      unwatchFile: vi.fn(async () => {}),
    } as unknown as typeof window.electronDesktop;

    const tab = useEditorStore.getState().createTab('watched.txt', 'plaintext', 'C:\\tmp\\watched.txt');
    setEditorState(tab.id, EditorState.create({ doc: 'original' }));
    render(<App />);
    await waitFor(() => expect(fileChangedHandler).toBeTypeOf('function'));

    const pendingChange = fileChangedHandler({ path: 'C:\\tmp\\watched.txt', kind: 'change' });
    await act(async () => {
      setEditorState(tab.id, EditorState.create({ doc: 'user edit' }));
      useEditorStore.getState().markTabDirty(tab.id, true);
      finishRead({ text: 'external edit', encoding: 'UTF-8' });
      await pendingChange;
    });

    expect(getEditorContent(tab.id)).toBe('user edit');
    expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(true);
  });

  it('closes preview automatically when enabling split view', () => {
    useEditorStore.getState().createTab('preview.md', 'markdown', undefined, 1);
    useEditorStore.getState().createTab('notes.txt', 'plaintext', undefined, 1);
    useUIStore.getState().setPreviewVisible(true);

    render(<App />);

    const splitButton = screen.getByRole('button', { name: 'split-editor' });
    expect(splitButton).toBeEnabled();

    fireEvent.click(splitButton);

    const editorState = useEditorStore.getState();
    expect(useUIStore.getState().previewVisible).toBe(false);
    expect(editorState.splitMode).toBe(true);
    expect(editorState.tabs.some((tab) => tab.group === 2)).toBe(true);
  });

  it('preserves the selected settings category after closing and reopening', async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle('设置'));
    const appearance = await screen.findByRole('button', { name: '外观' });
    fireEvent.click(appearance);
    expect(screen.getByText('当前主题')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('关闭 (Esc)'));
    expect(screen.queryByText('当前主题')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('设置'));
    expect(await screen.findByText('当前主题')).toBeInTheDocument();
  });
});
