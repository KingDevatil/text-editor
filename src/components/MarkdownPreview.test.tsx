import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MarkdownPreview from './MarkdownPreview';

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

describe('MarkdownPreview', () => {
  beforeEach(() => {
    getEditorContent.mockClear();
    subscribeContentChange.mockClear();
    unsubscribe.mockClear();
    currentContent = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to content changes when visible', () => {
    render(<MarkdownPreview tabId="tab1" theme="light" visible={true} />);
    expect(subscribeContentChange).toHaveBeenCalledWith('tab1', expect.any(Function));
  });

  it('unsubscribes when visible becomes false', () => {
    const { rerender } = render(
      <MarkdownPreview tabId="tab1" theme="light" visible={true} />
    );
    expect(subscribeContentChange).toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();

    rerender(<MarkdownPreview tabId="tab1" theme="light" visible={false} />);
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('resubscribes when visible becomes true again', () => {
    const { rerender } = render(
      <MarkdownPreview tabId="tab1" theme="light" visible={false} />
    );
    expect(subscribeContentChange).not.toHaveBeenCalled();

    rerender(<MarkdownPreview tabId="tab1" theme="light" visible={true} />);
    expect(subscribeContentChange).toHaveBeenCalledWith('tab1', expect.any(Function));
  });

  it('adds resizable handles to markdown tables', () => {
    currentContent = [
      '| Name | Count |',
      '| --- | --- |',
      '| Alpha | 1 |',
    ].join('\n');

    render(<MarkdownPreview tabId="tab1" theme="light" visible={true} />);

    expect(screen.getByRole('separator', { name: 'Resize table column' })).toBeInTheDocument();
  });

  it('resizes markdown table columns by dragging a handle', () => {
    currentContent = [
      '| Name | Count |',
      '| --- | --- |',
      '| Alpha | 1 |',
    ].join('\n');

    const { container } = render(<MarkdownPreview tabId="tab1" theme="light" visible={true} />);
    const handle = screen.getByRole('separator', { name: 'Resize table column' });

    fireEvent.pointerDown(handle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 140 });
    fireEvent.pointerUp(window);

    const firstCol = container.querySelector('col');
    expect(firstCol).toHaveStyle({ width: '88px' });
  });
});
