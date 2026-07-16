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

function mockRect(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    right,
    top: 0,
    bottom: 36,
    width: right - left,
    height: 36,
    toJSON: () => ({}),
  } as DOMRect;
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

  it('activates a tab on the first click without an artificial delay', () => {
    const onTabClick = vi.fn();

    render(
      <TabBar
        tabs={[makeTab('first', 'first.txt', 1), makeTab('second', 'second.txt', 1)]}
        activeTabId="first"
        activeGroup1TabId="first"
        activeGroup2TabId={null}
        splitMode={false}
        onTabClick={onTabClick}
        onTabClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('second.txt'));
    expect(onTabClick).toHaveBeenCalledWith('second', 1);
  });

  it('renames a double-clicked tab without treating it as blank-space double click', () => {
    const onNewFileInGroup = vi.fn();

    render(
      <TabBar
        tabs={[makeTab('first', 'first.txt', 1)]}
        activeTabId="first"
        activeGroup1TabId="first"
        activeGroup2TabId={null}
        splitMode={false}
        onTabClick={vi.fn()}
        onTabClose={vi.fn()}
        onNewFileInGroup={onNewFileInGroup}
        onRenameTab={vi.fn()}
      />
    );

    fireEvent.doubleClick(screen.getByText('first.txt').closest('[data-tab-id]')!);

    expect(screen.getByDisplayValue('first.txt')).toBeInTheDocument();
    expect(onNewFileInGroup).not.toHaveBeenCalled();
  });

  it('scrolls the newly active tab into the visible area', async () => {
    const tabs = [
      makeTab('first', 'first.txt', 1),
      makeTab('second', 'second.txt', 1),
      makeTab('third', 'third.txt', 1),
      makeTab('fourth', 'fourth.txt', 1),
    ];
    const { rerender } = render(
      <TabBar
        tabs={tabs}
        activeTabId="first"
        activeGroup1TabId="first"
        activeGroup2TabId={null}
        splitMode={false}
        onTabClick={vi.fn()}
        onTabClose={vi.fn()}
      />
    );

    const scrollArea = screen.getByTestId('tab-scroll-group-1');
    const fourthTab = screen.getByText('fourth.txt').closest('[data-tab-id]') as HTMLDivElement;
    const scrollBy = vi.fn();
    Object.defineProperties(scrollArea, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 480 },
      scrollBy: { configurable: true, value: scrollBy },
    });
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(mockRect(0, 300));
    vi.spyOn(fourthTab, 'getBoundingClientRect').mockReturnValue(mockRect(360, 480));

    rerender(
      <TabBar
        tabs={tabs}
        activeTabId="fourth"
        activeGroup1TabId="fourth"
        activeGroup2TabId={null}
        splitMode={false}
        onTabClick={vi.fn()}
        onTabClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledWith({ left: 212, behavior: 'smooth' });
    });
  });

  it('uses a vertical mouse wheel to browse an overflowing tab strip', () => {
    render(
      <TabBar
        tabs={[makeTab('first', 'first.txt', 1), makeTab('second', 'second.txt', 1)]}
        activeTabId="first"
        activeGroup1TabId="first"
        activeGroup2TabId={null}
        splitMode={false}
        onTabClick={vi.fn()}
        onTabClose={vi.fn()}
      />
    );

    const scrollArea = screen.getByTestId('tab-scroll-group-1');
    const scrollBy = vi.fn();
    Object.defineProperties(scrollArea, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 360 },
      scrollBy: { configurable: true, value: scrollBy },
    });

    fireEvent.wheel(scrollArea, { deltaX: 0, deltaY: 96 });

    expect(scrollBy).toHaveBeenCalledWith({ left: 96, behavior: 'auto' });
  });

  it('keeps the active tab visible independently in the second split group', async () => {
    const tabs = [
      makeTab('left', 'left.txt', 1),
      makeTab('right-first', 'right-first.txt', 2),
      makeTab('right-second', 'right-second.txt', 2),
      makeTab('right-third', 'right-third.txt', 2),
    ];
    const { rerender } = render(
      <TabBar
        tabs={tabs}
        activeTabId="right-first"
        activeGroup1TabId="left"
        activeGroup2TabId="right-first"
        splitMode={true}
        onTabClick={vi.fn()}
        onTabClose={vi.fn()}
      />
    );

    const scrollArea = screen.getByTestId('tab-scroll-group-2');
    const rightThirdTab = screen.getByText('right-third.txt').closest('[data-tab-id]') as HTMLDivElement;
    const scrollBy = vi.fn();
    Object.defineProperties(scrollArea, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 360 },
      scrollBy: { configurable: true, value: scrollBy },
    });
    vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue(mockRect(200, 400));
    vi.spyOn(rightThirdTab, 'getBoundingClientRect').mockReturnValue(mockRect(440, 560));

    rerender(
      <TabBar
        tabs={tabs}
        activeTabId="right-third"
        activeGroup1TabId="left"
        activeGroup2TabId="right-third"
        splitMode={true}
        onTabClick={vi.fn()}
        onTabClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(scrollBy).toHaveBeenCalledWith({ left: 192, behavior: 'smooth' });
    });
  });
});
