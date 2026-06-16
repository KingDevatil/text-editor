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
    vi.restoreAllMocks();
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

  it('does not throw when sandboxed iframe window access is blocked by message handling', () => {
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(() => {
      throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
    });

    render(<HtmlPreview tabId="tab1" theme="light" visible={true} onApplyHtml={vi.fn()} />);

    expect(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'ignored-message' },
      }));
    }).not.toThrow();
  });
});
