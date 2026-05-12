import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import MarkdownReader from './MarkdownReader';

const getEditorContent = vi.fn(() => '');

vi.mock('../hooks/useEditorStatePool', () => ({
  getEditorContent: (...args: unknown[]) => getEditorContent(...args),
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
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops polling when visible becomes false', () => {
    const { rerender } = render(
      <MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );

    vi.advanceTimersByTime(50);
    expect(getEditorContent).toHaveBeenCalled();

    getEditorContent.mockClear();

    rerender(<MarkdownReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={false} />);

    vi.advanceTimersByTime(50);
    expect(getEditorContent).not.toHaveBeenCalled();
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
});
