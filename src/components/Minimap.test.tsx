import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import Minimap from './Minimap';

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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      return setTimeout(cb, 16) as unknown as number;
    });
    globalThis.cancelAnimationFrame = vi.fn((id: number) => {
      clearTimeout(id);
    });

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
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a canvas element', () => {
    const viewRef = { current: mockView as unknown as import('@codemirror/view').EditorView };
    const { container } = render(<Minimap viewRef={viewRef} theme="dark" />);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('cleans up timers on unmount', () => {
    const cancelAnimationFrameSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const viewRef = { current: mockView as unknown as import('@codemirror/view').EditorView };
    const { unmount } = render(<Minimap viewRef={viewRef} theme="dark" />);

    unmount();

    const totalCleanup = cancelAnimationFrameSpy.mock.calls.length + clearTimeoutSpy.mock.calls.length;
    expect(totalCleanup).toBeGreaterThan(0);
  });
});
