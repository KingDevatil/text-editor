import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './useEditorStore';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      activeGroup1TabId: null,
      activeGroup2TabId: null,
      splitMode: false,
    });
  });

  it('increments the tab revision for content and persisted metadata changes', () => {
    const tab = useEditorStore.getState().createTab('revision.txt');
    expect(tab.revision).toBe(0);

    useEditorStore.getState().markTabDirty(tab.id, true);
    useEditorStore.getState().setTabEncoding(tab.id, 'UTF-8 BOM');
    useEditorStore.getState().setTabLineEnding(tab.id, 'CRLF');

    expect(useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id)?.revision).toBe(3);
  });

  it('does not change the revision when a tab is marked saved', () => {
    const tab = useEditorStore.getState().createTab('saved.txt');
    useEditorStore.getState().markTabDirty(tab.id, true);
    useEditorStore.getState().markTabSaved(tab.id);

    const saved = useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id);
    expect(saved?.revision).toBe(1);
    expect(saved?.isDirty).toBe(false);
  });

  // ── setActiveTabId ──
  it('setActiveTabId syncs activeGroup1TabId when tab is in group 1', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-1', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
      ],
      activeGroup1TabId: 'tab-1',
    });

    useEditorStore.getState().setActiveTabId('tab-1');

    const state = useEditorStore.getState();
    expect(state.activeTabId).toBe('tab-1');
    expect(state.activeGroup1TabId).toBe('tab-1');
  });

  it('setActiveTabId syncs activeGroup2TabId when tab is in group 2', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-1', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-2', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 2 },
      ],
      activeGroup1TabId: 'tab-1',
      activeGroup2TabId: null,
    });

    useEditorStore.getState().setActiveTabId('tab-2');

    const state = useEditorStore.getState();
    expect(state.activeTabId).toBe('tab-2');
    expect(state.activeGroup2TabId).toBe('tab-2');
    expect(state.activeGroup1TabId).toBe('tab-1');
  });

  it('setActiveTabId preserves group ids when id is null', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-1', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
      ],
      activeTabId: 'tab-1',
      activeGroup1TabId: 'tab-1',
    });

    useEditorStore.getState().setActiveTabId(null);

    const state = useEditorStore.getState();
    expect(state.activeTabId).toBeNull();
    expect(state.activeGroup1TabId).toBe('tab-1');
  });

  // ── moveTabToGroup (split screen drag) ──
  it('moveTabToGroup switches source group to another remaining tab when moving active tab from group1 to group2', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 1 },
        { id: 'tab-c', title: 'c.txt', language: 'plaintext', isDirty: false, filePath: '/c.txt', group: 2 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: 'tab-c',
    });

    useEditorStore.getState().moveTabToGroup('tab-a', 2);

    const state = useEditorStore.getState();
    expect(state.tabs.find((t) => t.id === 'tab-a')?.group).toBe(2);
    // activeTabId should move with the tab
    expect(state.activeTabId).toBe('tab-a');
    // target group active should be the moved tab
    expect(state.activeGroup2TabId).toBe('tab-a');
    // source group should switch to a remaining tab
    expect(state.activeGroup1TabId).toBe('tab-b');
  });

  it('moveTabToGroup switches source group to another remaining tab when moving active tab from group2 to group1', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 2 },
        { id: 'tab-c', title: 'c.txt', language: 'plaintext', isDirty: false, filePath: '/c.txt', group: 2 },
      ],
      activeTabId: 'tab-b',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: 'tab-b',
    });

    useEditorStore.getState().moveTabToGroup('tab-b', 1);

    const state = useEditorStore.getState();
    expect(state.tabs.find((t) => t.id === 'tab-b')?.group).toBe(1);
    expect(state.activeTabId).toBe('tab-b');
    expect(state.activeGroup1TabId).toBe('tab-b');
    expect(state.activeGroup2TabId).toBe('tab-c');
  });

  it('moveTabToGroup does not change source group active when moving a non-active tab', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
    });

    useEditorStore.getState().moveTabToGroup('tab-b', 2);

    const state = useEditorStore.getState();
    expect(state.tabs.find((t) => t.id === 'tab-b')?.group).toBe(2);
    expect(state.activeTabId).toBe('tab-b');
    expect(state.activeGroup1TabId).toBe('tab-a');
    expect(state.activeGroup2TabId).toBe('tab-b');
  });

  it('moveTabToGroup is no-op when tab is already in target group', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
    });

    useEditorStore.getState().moveTabToGroup('tab-a', 1);

    const state = useEditorStore.getState();
    expect(state.tabs[0].group).toBe(1);
    expect(state.activeTabId).toBe('tab-a');
    expect(state.activeGroup1TabId).toBe('tab-a');
  });

  // ── closeTab ──
  it('closeTab switches group1 active to another remaining tab when closing active tab', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
    });

    useEditorStore.getState().closeTab('tab-a');

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe('tab-b');
    expect(state.activeGroup1TabId).toBe('tab-b');
  });

  it('closeTab switches group2 active to another remaining tab when closing active tab', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 2 },
        { id: 'tab-c', title: 'c.txt', language: 'plaintext', isDirty: false, filePath: '/c.txt', group: 2 },
      ],
      activeTabId: 'tab-b',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: 'tab-b',
    });

    useEditorStore.getState().closeTab('tab-b');

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe('tab-c');
    expect(state.activeGroup2TabId).toBe('tab-c');
    expect(state.activeGroup1TabId).toBe('tab-a');
  });

  it('closeTab clears all active ids and splitMode when closing the last tab', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
      splitMode: false,
    });

    useEditorStore.getState().closeTab('tab-a');

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
    expect(state.activeGroup1TabId).toBeNull();
    expect(state.activeGroup2TabId).toBeNull();
    expect(state.splitMode).toBe(false);
  });

  it('closeTab does not change active ids when closing a non-active tab', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
    });

    useEditorStore.getState().closeTab('tab-b');

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe('tab-a');
    expect(state.activeGroup1TabId).toBe('tab-a');
  });

  it('closeTab falls back to group1 when group2 becomes empty', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 2 },
      ],
      activeTabId: 'tab-b',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: 'tab-b',
      splitMode: true,
    });

    useEditorStore.getState().closeTab('tab-b');

    const state = useEditorStore.getState();
    expect(state.activeTabId).toBe('tab-a');
    expect(state.activeGroup2TabId).toBeNull();
    expect(state.splitMode).toBe(false);
  });

  // ── closeTabs ──
  it('closeTabs handles batch close including active tabs correctly', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 1 },
        { id: 'tab-c', title: 'c.txt', language: 'plaintext', isDirty: false, filePath: '/c.txt', group: 2 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: 'tab-c',
    });

    useEditorStore.getState().closeTabs(['tab-a', 'tab-c']);

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe('tab-b');
    expect(state.activeTabId).toBe('tab-b');
    expect(state.activeGroup1TabId).toBe('tab-b');
    expect(state.activeGroup2TabId).toBeNull();
  });

  // ── closeAllTabs ──
  it('closeAllTabs resets everything', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 2 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: 'tab-b',
      splitMode: true,
      previewVisible: true,
    });

    useEditorStore.getState().closeAllTabs();

    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
    expect(state.activeGroup1TabId).toBeNull();
    expect(state.activeGroup2TabId).toBeNull();
    expect(state.splitMode).toBe(false);
  });

  // ── createTab ──
  it('createTab sets activeGroup2TabId when creating a tab in group 2', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
    });

    const newTab = useEditorStore.getState().createTab('b.txt', 'plaintext', '/b.txt', 2);

    const state = useEditorStore.getState();
    expect(newTab.group).toBe(2);
    expect(state.activeTabId).toBe(newTab.id);
    expect(state.activeGroup2TabId).toBe(newTab.id);
    expect(state.activeGroup1TabId).toBe('tab-a');
  });

  // ── setSplitMode ──
  it('setSplitMode(true) moves current active tab to group2 and picks another for group1', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: null,
      splitMode: false,
    });

    useEditorStore.getState().setSplitMode(true);

    const state = useEditorStore.getState();
    expect(state.splitMode).toBe(true);
    expect(state.tabs.find((t) => t.id === 'tab-a')?.group).toBe(2);
    expect(state.activeGroup2TabId).toBe('tab-a');
    expect(state.activeGroup1TabId).toBe('tab-b');
  });

  it('setSplitMode(true) is no-op when fewer than 2 tabs', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
      ],
      activeTabId: 'tab-a',
      activeGroup1TabId: 'tab-a',
      splitMode: false,
    });

    useEditorStore.getState().setSplitMode(true);

    const state = useEditorStore.getState();
    expect(state.splitMode).toBe(false);
    expect(state.tabs[0].group).toBe(1);
  });

  it('setSplitMode(false) merges all tabs into group1', () => {
    useEditorStore.setState({
      tabs: [
        { id: 'tab-a', title: 'a.txt', language: 'plaintext', isDirty: false, filePath: '/a.txt', group: 1 },
        { id: 'tab-b', title: 'b.txt', language: 'plaintext', isDirty: false, filePath: '/b.txt', group: 2 },
      ],
      activeTabId: 'tab-b',
      activeGroup1TabId: 'tab-a',
      activeGroup2TabId: 'tab-b',
      splitMode: true,
    });

    useEditorStore.getState().setSplitMode(false);

    const state = useEditorStore.getState();
    expect(state.splitMode).toBe(false);
    expect(state.tabs.every((t) => t.group === 1 || !t.group)).toBe(true);
    expect(state.activeGroup1TabId).toBe('tab-b');
    expect(state.activeGroup2TabId).toBeNull();
  });
});
