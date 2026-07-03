import React from 'react';
import { EditorState } from '@codemirror/state';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { useEditorStore } from './hooks/useEditorStore';
import { setEditorState } from './hooks/useEditorStatePool';

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
});
