import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => false,
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn(() => Promise.resolve(() => {})) }) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ show: vi.fn(), onCloseRequested: vi.fn(() => Promise.resolve(() => {})) }) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), confirm: vi.fn(), message: vi.fn() }));

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
  });

  it('renders the app shell', () => {
    render(<App />);
    expect(document.querySelector('.flex.flex-col.h-screen')).toBeInTheDocument();
  });

  it('shows empty state when no tabs are open', () => {
    render(<App />);
    expect(screen.getByText(/没有打开的文件/)).toBeInTheDocument();
  });
});
