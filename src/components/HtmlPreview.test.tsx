import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import HtmlPreview from './HtmlPreview';

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

describe('HtmlPreview', () => {
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
    render(<HtmlPreview tabId="tab1" theme="light" visible={true} />);
    expect(subscribeContentChange).toHaveBeenCalledWith('tab1', expect.any(Function));
  });

  it('unsubscribes when visible becomes false', () => {
    const { rerender } = render(<HtmlPreview tabId="tab1" theme="light" visible={true} />);
    expect(unsubscribe).not.toHaveBeenCalled();

    rerender(<HtmlPreview tabId="tab1" theme="light" visible={false} />);
    expect(unsubscribe).toHaveBeenCalled();
  });
});
