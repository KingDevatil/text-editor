import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuickOpen from './QuickOpen';

describe('QuickOpen', () => {
  it('keeps keyboard navigation stable when there are no results', () => {
    const onOpenFile = vi.fn();
    const onActivateTab = vi.fn();
    render(
      <QuickOpen
        open
        onClose={vi.fn()}
        mruItems={[]}
        openTabs={[]}
        onOpenFile={onOpenFile}
        onActivateTab={onActivateTab}
      />
    );

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(screen.getByRole('dialog', { name: '快速打开' })).toBeInTheDocument();
    expect(screen.getByText('没有匹配的文件')).toBeInTheDocument();
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(onActivateTab).not.toHaveBeenCalled();
  });
});
