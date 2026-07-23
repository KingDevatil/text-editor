import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { undo } from '@codemirror/commands';
import CmEditor from './CmEditor';
import {
  completeProgressiveEditorContent,
  getActiveView,
  setPendingSelection,
} from '../hooks/useEditorStatePool';
import { useEditorStore } from '../hooks/useEditorStore';

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

  it('clamps restored selection when the restored document is shorter', () => {
    setPendingSelection('tab-missing-file', 120, 120);

    const { container } = render(
      <CmEditor
        tabId="tab-missing-file"
        language="plaintext"
        theme="dark"
        fontSize={14}
        initialContent=""
      />
    );

    expect(container.querySelector('.cm-editor')).toBeInTheDocument();
  });

  it('clears the dirty state after undo returns to the last saved content', async () => {
    const tab = useEditorStore.getState().createTab('undo-to-save.txt');
    render(
      <CmEditor
        tabId={tab.id}
        language="plaintext"
        theme="dark"
        fontSize={14}
        initialContent="saved"
        minimapVisible={false}
      />
    );
    const view = getActiveView(tab.id)!;

    view.dispatch({ changes: { from: view.state.doc.length, insert: ' edit' } });
    await waitFor(() => {
      expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(true);
    });

    expect(undo(view)).toBe(true);
    await waitFor(() => {
      expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(false);
    });
  });

  it('does not treat progressive load completion as a user edit', async () => {
    const preview = 'header\nfirst chunk\n';
    const fullContent = `${preview}remaining content\n`;
    const tab = useEditorStore.getState().createTab(
      'progressive.xml',
      'xml',
      'C:\\tmp\\progressive.xml',
      1,
      'UTF-8',
      preview,
    );
    render(
      <CmEditor
        tabId={tab.id}
        language="xml"
        theme="dark"
        fontSize={14}
        initialContent={preview}
        largeFileOptimize
        forceLargeFile
        minimapVisible={false}
      />,
    );
    const view = getActiveView(tab.id)!;

    expect(completeProgressiveEditorContent(tab.id, preview, fullContent)).toBe(true);
    expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(false);
    expect(undo(view)).toBe(false);
  });

  it('keeps unicode scanning disabled when it is toggled during large-file mode', async () => {
    const props = {
      tabId: 'large-unicode-toggle',
      language: 'plaintext' as const,
      theme: 'dark' as const,
      fontSize: 14,
      initialContent: 'fullwidth：Ａ',
      largeFileOptimize: true,
      forceLargeFile: true,
      minimapVisible: false,
    };
    const { container, rerender } = render(<CmEditor {...props} unicodeHighlight={false} />);
    expect(container.querySelector('.cm-unicode-highlight')).not.toBeInTheDocument();

    rerender(<CmEditor {...props} unicodeHighlight={true} />);

    await waitFor(() => {
      expect(container.querySelector('.cm-unicode-highlight')).not.toBeInTheDocument();
    });
  });
});
