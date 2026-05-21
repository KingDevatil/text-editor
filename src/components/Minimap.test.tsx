import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Minimap from './Minimap';

const unsubscribe = vi.fn();
const subscribeEditorUpdate = vi.fn(() => unsubscribe);

vi.mock('../hooks/useEditorStatePool', () => ({
  subscribeEditorUpdate: (...args: unknown[]) => subscribeEditorUpdate(...args),
}));

describe('Minimap', () => {
  const mockView = {
    state: {
      doc: {
        lines: 5,
        length: 50,
        line: (n: number) => ({ text: `line ${n}`, from: (n - 1) * 10, to: n * 10 }),
        lineAt: (pos: number) => ({ number: Math.floor(pos / 10) + 1 }),
      },
      selection: { main: { head: 0 } },
    },
    viewport: { from: 0, to: 50 },
    dom: {
      getBoundingClientRect: () => ({ height: 600 }),
      querySelector: () => null,
    },
    defaultLineHeight: 16,
    dispatch: vi.fn(),
  };

  beforeEach(() => {
    subscribeEditorUpdate.mockClear();
    unsubscribe.mockClear();

    // Mock getBoundingClientRect for the minimap container
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 120,
      height: 300,
      top: 0,
      left: 0,
      bottom: 300,
      right: 120,
      x: 0,
      y: 0,
      toJSON: () => {},
    }));

    // Ensure container is considered visible so render() proceeds
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() { return this.parentElement || document.body; },
    });

    globalThis.getComputedStyle = vi.fn(() => ({
      getPropertyValue: () => '#000000',
    })) as unknown as typeof globalThis.getComputedStyle;

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      get fillStyle() { return ''; },
      set fillStyle(_: string) {},
      get strokeStyle() { return ''; },
      set strokeStyle(_: string) {},
      get lineWidth() { return 1; },
      set lineWidth(_: number) {},
      get globalAlpha() { return 1; },
      set globalAlpha(_: number) {},
    })) as unknown as HTMLCanvasElement['getContext'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up offsetParent override so it doesn't leak to other test files
    delete (HTMLElement.prototype as Record<string, unknown>).offsetParent;
  });

  it('renders a canvas element', () => {
    const viewRef = { current: mockView as unknown as import('@codemirror/view').EditorView };
    const { container } = render(<Minimap tabId="tab1" viewRef={viewRef} theme="dark" />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('subscribes to editor updates on mount', () => {
    const viewRef = { current: mockView as unknown as import('@codemirror/view').EditorView };
    render(<Minimap tabId="tab1" viewRef={viewRef} theme="dark" />);
    expect(subscribeEditorUpdate).toHaveBeenCalledWith('tab1', expect.any(Function));
  });

  it('unsubscribes on unmount', () => {
    const viewRef = { current: mockView as unknown as import('@codemirror/view').EditorView };
    const { unmount } = render(<Minimap tabId="tab1" viewRef={viewRef} theme="dark" />);
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('re-renders on te-theme-change event', () => {
    const ctxMock = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      get fillStyle() { return ''; },
      set fillStyle(_: string) {},
      get strokeStyle() { return ''; },
      set strokeStyle(_: string) {},
      get lineWidth() { return 1; },
      set lineWidth(_: number) {},
      get globalAlpha() { return 1; },
      set globalAlpha(_: number) {},
    };
    (HTMLCanvasElement.prototype.getContext as unknown as { mockReturnValue(v: unknown): void }).mockReturnValue(ctxMock);

    const viewRef = { current: mockView as unknown as import('@codemirror/view').EditorView };
    render(<Minimap tabId="tab1" viewRef={viewRef} theme="dark" />);
    const fillRectCallsBefore = ctxMock.fillRect.mock.calls.length;

    window.dispatchEvent(new CustomEvent('te-theme-change'));

    expect(ctxMock.fillRect.mock.calls.length).toBeGreaterThan(fillRectCallsBefore);
  });
});
