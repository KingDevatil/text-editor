import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from './useEditorStore';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [],
      activeTabId: null,
      activeGroup1TabId: null,
      activeGroup2TabId: null,
    });
  });

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
});
