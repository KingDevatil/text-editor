import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import StatusBar from './StatusBar';
import type { EditorTab } from '../types';

const subscribeMock = vi.fn(() => vi.fn());
const getEditorLineCountMock = vi.fn(() => 42);
const getEditorValueLengthMock = vi.fn(() => 1337);

vi.mock('../hooks/useEditorStatePool', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useEditorStatePool')>('../hooks/useEditorStatePool');
  return {
    ...actual,
    subscribeContentChange: (...args: Parameters<typeof actual.subscribeContentChange>) => {
      subscribeMock(...args);
      return subscribeMock.mock.results[subscribeMock.mock.results.length - 1]?.value ?? vi.fn();
    },
    getEditorLineCount: () => getEditorLineCountMock(),
    getEditorValueLength: () => getEditorValueLengthMock(),
  };
});

describe('StatusBar', () => {
  beforeEach(() => {
    subscribeMock.mockClear();
    getEditorLineCountMock.mockReturnValue(42);
    getEditorValueLengthMock.mockReturnValue(1337);
  });

  const mockTab: EditorTab = {
    id: 'tab-1',
    title: 'test.ts',
    language: 'typescript',
    isDirty: false,
    encoding: 'UTF-8',
  };

  it('renders quick stats and subscribes to content changes', () => {
    render(<StatusBar activeTab={mockTab} theme="dark" />);

    expect(screen.getByText(/行 42/)).toBeInTheDocument();
    expect(screen.getByText(/字符 1337/)).toBeInTheDocument();
    expect(subscribeMock).toHaveBeenCalledWith('tab-1', expect.any(Function));
  });

  it('displays external change notice when provided', () => {
    const { rerender } = render(<StatusBar activeTab={mockTab} theme="dark" />);
    expect(screen.queryByText('已同步外部变更')).not.toBeInTheDocument();

    rerender(<StatusBar activeTab={mockTab} theme="dark" externalChangeNotice="已同步外部变更" />);
    expect(screen.getByText('已同步外部变更')).toBeInTheDocument();
  });

  it('shows dirty / saved badge', () => {
    const { rerender } = render(<StatusBar activeTab={{ ...mockTab, isDirty: false }} theme="dark" />);
    expect(screen.getByText('已保存')).toBeInTheDocument();

    rerender(<StatusBar activeTab={{ ...mockTab, isDirty: true }} theme="dark" />);
    expect(screen.getByText('已修改')).toBeInTheDocument();
  });

  it('subscribes to new tabId on change', () => {
    const { rerender } = render(<StatusBar activeTab={mockTab} theme="dark" />);
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    rerender(<StatusBar activeTab={{ ...mockTab, id: 'tab-2' }} theme="dark" />);
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock).toHaveBeenLastCalledWith('tab-2', expect.any(Function));
  });
});
