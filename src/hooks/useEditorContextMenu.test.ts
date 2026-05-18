import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEditorContextMenu } from './useEditorContextMenu';

// ── mocks ──
const mockCloseTab = vi.fn();
const mockCloseTabs = vi.fn();
const mockSetDiffPair = vi.fn();
const mockSetDiffMode = vi.fn();

vi.mock('./useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      tabs: [
        { id: 'tab-1', title: 'a.txt', filePath: '/a.txt' },
        { id: 'tab-2', title: 'b.txt', filePath: '/b.txt' },
      ],
      diffMode: false,
      closeTab: mockCloseTab,
      closeTabs: mockCloseTabs,
      setDiffPair: mockSetDiffPair,
      setDiffMode: mockSetDiffMode,
    }),
  },
}));

vi.mock('./useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      minimapVisible: true,
      wordWrap: false,
      showWhitespace: false,
      setMinimapVisible: vi.fn(),
      setWordWrap: vi.fn(),
      setShowWhitespace: vi.fn(),
    }),
  },
}));

vi.mock('../utils/clipboard', () => ({
  writeClipboard: vi.fn(),
  readClipboard: vi.fn(() => Promise.resolve('')),
}));

vi.mock('../utils/cmCommands', () => ({
  formatDocument: vi.fn(() => true),
  goToDefinition: vi.fn(() => true),
}));

describe('useEditorContextMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set context menu on handleContextMenu call', () => {
    const viewRef = { current: null as any };

    const { result } = renderHook(() =>
      useEditorContextMenu(
        viewRef,
        'plaintext',
        'tab-1',
        false
      )
    );

    act(() => {
      result.current.handleContextMenu({
        preventDefault: vi.fn(),
        clientX: 100,
        clientY: 200,
      } as unknown as MouseEvent);
    });

    expect(result.current.contextMenu).not.toBeNull();
    expect(result.current.contextMenu?.x).toBe(100);
    expect(result.current.contextMenu?.y).toBe(200);
  });

  it('should close context menu via setContextMenu', () => {
    const viewRef = { current: null as any };

    const { result } = renderHook(() =>
      useEditorContextMenu(
        viewRef,
        'plaintext',
        'tab-1',
        false
      )
    );

    act(() => {
      result.current.handleContextMenu({
        preventDefault: vi.fn(),
        clientX: 50,
        clientY: 60,
      } as unknown as MouseEvent);
    });
    expect(result.current.contextMenu).not.toBeNull();

    act(() => {
      result.current.setContextMenu();
    });
    expect(result.current.contextMenu).toBeNull();
  });


});
