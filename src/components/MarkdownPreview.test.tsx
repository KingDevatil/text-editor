import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MarkdownPreview from './MarkdownPreview';
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

describe('MarkdownPreview', () => {
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

  it('initializes table columns evenly when later columns contain long text', () => {
    currentContent = [
      '| A | B | C |',
      '| --- | --- | --- |',
      '| 1 | 2 | ThisIsAVeryLongUnbrokenValueThatShouldWrapInsideTheThirdColumnInsteadOfOwningTheWholeTableWidth |',
    ].join('\n');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const width = this.classList.contains('prose') ? 900 : 0;
      return { width, height: 100, top: 0, right: width, bottom: 100, left: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });

    const { container } = render(<MarkdownPreview tabId="tab1" theme="light" visible={true} />);

    const cols = Array.from(container.querySelectorAll('col'));
    expect(cols).toHaveLength(3);
    expect(cols[0]).toHaveStyle({ width: '300px' });
    expect(cols[1]).toHaveStyle({ width: '300px' });
    expect(cols[2]).toHaveStyle({ width: '300px' });
    rectSpy.mockRestore();
  });

  it('highlights markdown preview matches and jumps to the next match', async () => {
    currentContent = 'alpha beta alpha';
    const { container } = render(<MarkdownPreview tabId="tab1" theme="light" visible={true} />);

    await act(async () => {
      useMarkdownSearchStore.getState().setQuery({ query: 'alpha', caseSensitive: false, regexMode: false });
    });

    expect(container.querySelectorAll('mark.markdown-search-match')).toHaveLength(2);
    expect(container.querySelector('mark.markdown-search-match-active')?.textContent).toBe('alpha');
    expect(useMarkdownSearchStore.getState().matchCount).toBe(2);
    expect(useMarkdownSearchStore.getState().currentMatch).toBe(1);

    await act(async () => {
      useMarkdownSearchStore.getState().findNext();
    });

    expect(useMarkdownSearchStore.getState().currentMatch).toBe(2);
  });
});
