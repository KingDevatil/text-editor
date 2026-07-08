import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabBar from './TabBar';
import type { EditorTab } from '../types';

function makeTab(id: string, title: string, group: 1 | 2): EditorTab {
  return {
    id,
    title,
    language: 'plaintext',
    isDirty: false,
    encoding: 'UTF-8',
    group,
  };
}

describe('TabBar', () => {
  it('highlights each split group active tab independently', () => {
    const tabs = [
      makeTab('left-active', 'left.txt', 1),
      makeTab('left-inactive', 'left-other.txt', 1),
      makeTab('right-active', 'right.txt', 2),
    ];

    render(
      <TabBar
        tabs={tabs}
        activeTabId="right-active"
        activeGroup1TabId="left-active"
        activeGroup2TabId="right-active"
        splitMode={true}
        onTabClick={vi.fn()}
        onTabClose={vi.fn()}
      />
    );

    expect(screen.getByText('left.txt').closest('[data-tab-id]')).toHaveAttribute('data-group-active', 'true');
    expect(screen.getByText('right.txt').closest('[data-tab-id]')).toHaveAttribute('data-group-active', 'true');
    expect(screen.getByText('left-other.txt').closest('[data-tab-id]')).toHaveAttribute('data-group-active', 'false');
  });
});
