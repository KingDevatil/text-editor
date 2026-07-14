import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  afterEach(() => {
    delete window.electronDesktop;
    vi.restoreAllMocks();
  });

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

  it('keeps a dirty tab open when the close confirmation fails', async () => {
    const tab = { ...makeTab('dirty', 'dirty.txt', 1), isDirty: true };
    const onTabClose = vi.fn();
    const confirm = vi.fn().mockRejectedValue(new Error('IPC unavailable'));
    window.electronDesktop = { confirm } as unknown as typeof window.electronDesktop;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <TabBar
        tabs={[tab]}
        activeTabId="dirty"
        activeGroup1TabId="dirty"
        activeGroup2TabId={null}
        splitMode={false}
        onTabClick={vi.fn()}
        onTabClose={onTabClose}
      />
    );

    fireEvent.click(screen.getByTitle('关闭'));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(onTabClose).not.toHaveBeenCalled();
  });
});
