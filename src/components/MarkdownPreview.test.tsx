import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import MarkdownPreview from './MarkdownPreview';

const getEditorContent = vi.fn(() => '');

vi.mock('../hooks/useEditorStatePool', () => ({
  getEditorContent: (...args: unknown[]) => getEditorContent(...args),
}));

describe('MarkdownPreview', () => {
  beforeEach(() => {
    getEditorContent.mockClear();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops polling getEditorContent when visible becomes false', () => {
    const { rerender } = render(
      <MarkdownPreview tabId="tab1" theme="light" visible={true} />
    );

    // Let a few rAF cycles run
    vi.advanceTimersByTime(50);
    expect(getEditorContent).toHaveBeenCalled();

    getEditorContent.mockClear();

    // Hide the preview
    rerender(<MarkdownPreview tabId="tab1" theme="light" visible={false} />);

    // Advance time — should not poll anymore
    vi.advanceTimersByTime(50);
    expect(getEditorContent).not.toHaveBeenCalled();
  });

  it('resumes polling when visible becomes true again', () => {
    const { rerender } = render(
      <MarkdownPreview tabId="tab1" theme="light" visible={false} />
    );

    vi.advanceTimersByTime(50);
    expect(getEditorContent).not.toHaveBeenCalled();

    // Show the preview
    rerender(<MarkdownPreview tabId="tab1" theme="light" visible={true} />);

    vi.advanceTimersByTime(50);
    expect(getEditorContent).toHaveBeenCalled();
  });
});
