import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ExternalChangeDialog from './ExternalChangeDialog';

vi.mock('./DiffEditor', () => ({
  __esModule: true,
  default: ({ leftContent, rightContent }: { leftContent: string; rightContent: string }) => (
    <div data-testid="diff-editor">
      <div data-testid="left">{leftContent}</div>
      <div data-testid="right">{rightContent}</div>
    </div>
  ),
}));

describe('ExternalChangeDialog', () => {
  const baseProps = {
    open: true,
    fileName: 'test.txt',
    currentContent: 'current line',
    externalContent: 'external line',
    theme: 'dark' as const,
    onUseExternal: vi.fn(),
    onKeepCurrent: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders nothing when closed', () => {
    const { container } = render(<ExternalChangeDialog {...baseProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders diff and file name when open', () => {
    render(<ExternalChangeDialog {...baseProps} />);
    expect(screen.getByText('外部变更：test.txt')).toBeInTheDocument();
    expect(screen.getByTestId('diff-editor')).toBeInTheDocument();
    expect(screen.getByTestId('left')).toHaveTextContent('current line');
    expect(screen.getByTestId('right')).toHaveTextContent('external line');
  });

  it('calls onUseExternal when using external version', () => {
    render(<ExternalChangeDialog {...baseProps} />);
    fireEvent.click(screen.getByText('使用外部版本'));
    expect(baseProps.onUseExternal).toHaveBeenCalled();
  });

  it('calls onKeepCurrent when keeping current edit', () => {
    render(<ExternalChangeDialog {...baseProps} />);
    fireEvent.click(screen.getByText('保留当前编辑'));
    expect(baseProps.onKeepCurrent).toHaveBeenCalled();
  });

  it('does not dismiss the decision when clicking backdrop', () => {
    render(<ExternalChangeDialog {...baseProps} />);
    const backdrop = screen.getByText('外部变更：test.txt').closest('div[class*="fixed"]');
    expect(backdrop).not.toBeNull();
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(baseProps.onClose).not.toHaveBeenCalled();
    }
  });
});
