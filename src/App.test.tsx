import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

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
