import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import HtmlPreview from './HtmlPreview';

const getEditorContent = vi.fn(() => '');

vi.mock('../hooks/useEditorStatePool', () => ({
  getEditorContent: (...args: unknown[]) => getEditorContent(...args),
}));

describe('HtmlPreview', () => {
  beforeEach(() => {
    getEditorContent.mockClear();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops polling getEditorContent when visible becomes false', () => {
    const { rerender } = render(
      <HtmlPreview tabId="tab1" theme="light" visible={true} />
    );

    vi.advanceTimersByTime(50);
    expect(getEditorContent).toHaveBeenCalled();

    getEditorContent.mockClear();

    rerender(<HtmlPreview tabId="tab1" theme="light" visible={false} />);

    vi.advanceTimersByTime(50);
    expect(getEditorContent).not.toHaveBeenCalled();
  });
});
