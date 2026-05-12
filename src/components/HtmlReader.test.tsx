import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import HtmlReader from './HtmlReader';

const getEditorContent = vi.fn(() => '');

vi.mock('../hooks/useEditorStatePool', () => ({
  getEditorContent: (...args: unknown[]) => getEditorContent(...args),
}));

describe('HtmlReader', () => {
  beforeEach(() => {
    getEditorContent.mockClear();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops polling when visible becomes false', () => {
    const { rerender } = render(
      <HtmlReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={true} />
    );

    vi.advanceTimersByTime(50);
    expect(getEditorContent).toHaveBeenCalled();

    getEditorContent.mockClear();

    rerender(<HtmlReader tabId="tab1" theme="light" onExit={vi.fn()} onToggleTheme={vi.fn()} visible={false} />);

    vi.advanceTimersByTime(50);
    expect(getEditorContent).not.toHaveBeenCalled();
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
