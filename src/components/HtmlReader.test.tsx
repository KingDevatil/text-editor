import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import HtmlReader from './HtmlReader';

const getEditorContent = vi.fn(() => '');
const unsubscribe = vi.fn();
const subscribeContentChange = vi.fn((_tabId: string, listener: (content: string) => void) => {
  listener('');
  return unsubscribe;
});

vi.mock('../hooks/useEditorStatePool', () => ({
  getEditorContent: (...args: unknown[]) => getEditorContent(...args),
  subscribeContentChange: (...args: unknown[]) => subscribeContentChange(...args),
}));

describe('HtmlReader', () => {
  beforeEach(() => {
    getEditorContent.mockClear();
    subscribeContentChange.mockClear();
    unsubscribe.mockClear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to content changes when visible', () => {
    render(
      <HtmlReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );
    expect(subscribeContentChange).toHaveBeenCalledWith('tab1', expect.any(Function));
  });

  it('unsubscribes when visible becomes false', () => {
    const { rerender } = render(
      <HtmlReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );
    expect(unsubscribe).not.toHaveBeenCalled();

    rerender(<HtmlReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={false} />);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('does not call onExit via ESC when not visible', () => {
    const onExit = vi.fn();
    render(
      <HtmlReader tabId="tab1" theme="light" onExit={onExit} onToggleTheme={vi.fn()} visible={false} />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('calls onExit via ESC when visible', () => {
    const onExit = vi.fn();
    render(
      <HtmlReader tabId="tab1" theme="light" onExit={onExit} onToggleTheme={vi.fn()} visible={true} />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
