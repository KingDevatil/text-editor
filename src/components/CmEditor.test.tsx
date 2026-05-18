import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import CmEditor from './CmEditor';

// Mock @tauri-apps/api/core so isTauri() returns false in test
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

describe('CmEditor', () => {
  it('renders editor container for a tab', () => {
    const { container } = render(
      <CmEditor
        tabId="tab-1"
        language="plaintext"
        theme="dark"
        fontSize={14}
        initialContent="hello world"
      />
    );
    expect(container.querySelector('.cm-editor')).toBeInTheDocument();
  });

  it('renders markdown toolbar for markdown language', () => {
    const { container } = render(
      <CmEditor
        tabId="tab-md"
        language="markdown"
        theme="dark"
        fontSize={14}
        initialContent="# Hello"
      />
    );
    // MarkdownToolbar renders button(s); check for a button in the container
    expect(container.querySelector('button')).toBeInTheDocument();
  });
});
