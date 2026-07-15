import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SearchResultsView from './SearchResultsView';

describe('SearchResultsView', () => {
  it('labels a capped result set as truncated', () => {
    render(
      <SearchResultsView
        query="needle"
        directory="C:\\project"
        truncated
        matches={[{
          filePath: 'C:\\project\\file.txt',
          lineNumber: 1,
          lineText: 'needle',
          matchStart: 0,
          matchEnd: 6,
        }]}
        onOpenFile={vi.fn()}
      />
    );

    expect(screen.getByText('仅显示前 1 条')).toBeInTheDocument();
  });
});
