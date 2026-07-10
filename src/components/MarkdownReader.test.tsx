import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, fireEvent, screen } from '@testing-library/react';
import MarkdownReader from './MarkdownReader';
import { useMarkdownSearchStore } from '../hooks/useMarkdownDocumentSearch';

const getEditorContent = vi.fn(() => '');
const unsubscribe = vi.fn();
let currentContent = '';
const subscribeContentChange = vi.fn((_tabId: string, listener: (content: string) => void) => {
  listener(currentContent);
  return unsubscribe;
});

vi.mock('../hooks/useEditorStatePool', () => ({
  getEditorContent: (...args: unknown[]) => getEditorContent(...args),
  subscribeContentChange: (...args: unknown[]) => subscribeContentChange(...args),
}));

vi.mock('../hooks/useEditorStore', () => ({
  useEditorStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { readerTocVisible: false, setReaderTocVisible: vi.fn() };
    return selector(state);
  }),
}));

describe('MarkdownReader', () => {
  beforeEach(() => {
    getEditorContent.mockClear();
    subscribeContentChange.mockClear();
    unsubscribe.mockClear();
    currentContent = '';
    useMarkdownSearchStore.setState({ query: null, direction: 1, sequence: 0, matchCount: 0, currentMatch: 0 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to content changes when visible', () => {
    render(
      <MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );
    expect(subscribeContentChange).toHaveBeenCalledWith('tab1', expect.any(Function));
  });

  it('unsubscribes when visible becomes false', () => {
    const { rerender } = render(
      <MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );
    expect(unsubscribe).not.toHaveBeenCalled();

    rerender(<MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={false} />);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('does not call onExit via ESC when not visible', () => {
    const onExit = vi.fn();
    render(
      <MarkdownReader tabId="tab1" theme="light" onExit={onExit} onToggleTheme={vi.fn()} visible={false} />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('calls onExit via ESC when visible', () => {
    const onExit = vi.fn();
    render(
      <MarkdownReader tabId="tab1" theme="light" onExit={onExit} onToggleTheme={vi.fn()} visible={true} />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('closes context menu when tabId changes', () => {
    const { rerender, container } = render(
      <MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );

    // Simulate right-click to open menu
    const scrollArea = container.querySelector('.overflow-auto');
    if (scrollArea) {
      fireEvent.contextMenu(scrollArea);
    }

    // Change tabId
    rerender(<MarkdownReader tabId="tab2" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />);

    // Menu should be gone
    expect(container.querySelector('[role="menu"]')).not.toBeInTheDocument();
  });

  it('adds resizable handles to markdown tables in reader mode', () => {
    currentContent = [
      '| Name | Count |',
      '| --- | --- |',
      '| Alpha | 1 |',
    ].join('\n');

    render(
      <MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );

    expect(screen.getByRole('separator', { name: 'Resize table column' })).toBeInTheDocument();
  });

  it('keeps table resize handles after scrolling down and returning to the header', async () => {
    currentContent = [
      '| Name | Count |',
      '| --- | --- |',
      '| Alpha | 1 |',
      '',
      ...Array.from({ length: 40 }, (_, index) => `paragraph ${index + 1}`),
    ].join('\n');

    const { container } = render(
      <MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );
    const scrollArea = container.querySelector<HTMLElement>('[data-markdown-search-surface="reader"]');
    expect(scrollArea).not.toBeNull();
    expect(screen.getByRole('separator', { name: 'Resize table column' })).toBeInTheDocument();

    fireEvent.scroll(scrollArea!, { target: { scrollTop: 400 } });
    fireEvent.scroll(scrollArea!, { target: { scrollTop: 0 } });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('separator', { name: 'Resize table column' })).toBeInTheDocument();
  });

  it('highlights markdown reader matches', async () => {
    currentContent = 'alpha beta alpha';
    const { container } = render(
      <MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );

    await act(async () => {
      useMarkdownSearchStore.getState().setQuery({ query: 'alpha', caseSensitive: false, regexMode: false });
    });

    expect(container.querySelectorAll('mark.markdown-search-match')).toHaveLength(2);
    expect(useMarkdownSearchStore.getState().matchCount).toBe(2);
  });
});
