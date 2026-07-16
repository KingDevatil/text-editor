import { create } from 'zustand';
import type { EditorTab, EditorTabKind, Language, Encoding, LineEnding, TabLoadState } from '../types';
import { EXT_TO_LANGUAGE } from '../types';
import { deleteEditorState, markEditorContentSaved } from './useEditorStatePool';

let tabCounter = 0;

function generateId(): string {
  return `tab-${++tabCounter}-${Date.now()}`;
}

function getLanguageFromFileName(fileName: string): Language {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  activeGroup1TabId: string | null;
  activeGroup2TabId: string | null;
  splitMode: boolean;
  projectPath: string | null;
  diffMode: boolean;
  diffLeftTabId: string | null;
  diffRightTabId: string | null;
}

interface EditorActions {
  createTab: (title?: string, language?: Language, filePath?: string, group?: 1 | 2, encoding?: Encoding, initialContent?: string, lineEnding?: LineEnding) => EditorTab;
  createVirtualTab: (title: string, kind: Exclude<EditorTabKind, 'editor'>, group?: 1 | 2) => EditorTab;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  closeTab: (tabId: string) => void;
  closeTabs: (idsToClose: string[]) => void;
  closeAllTabs: () => void;
  markTabSaved: (tabId: string) => void;
  renameTab: (tabId: string, newTitle: string, newFilePath?: string) => void;
  setTabEncoding: (tabId: string, encoding: Encoding) => void;
  setTabLanguage: (tabId: string, language: Language) => void;
  setTabInitialContent: (tabId: string, content: string) => void;
  setTabLoadState: (tabId: string, loadState: TabLoadState, loadError?: string) => void;
  setTabLargeFile: (tabId: string, isLargeFile: boolean) => void;
  setTabColumnAlign: (tabId: string, enabled: boolean) => void;
  setTabLineEnding: (tabId: string, lineEnding: LineEnding) => void;
  moveTabToGroup: (tabId: string, group: 1 | 2) => void;
  reorderTab: (tabId: string, group: 1 | 2, targetGroupIndex: number) => void;
  setSplitMode: (mode: boolean) => void;
  setActiveTabId: (id: string | null) => void;
  setActiveGroup1TabId: (id: string | null) => void;
  setActiveGroup2TabId: (id: string | null) => void;
  setProjectPath: (path: string | null) => void;
  setDiffMode: (mode: boolean) => void;
  setDiffPair: (left: string | null, right: string | null) => void;
}

const useEditorStore = create<EditorState & EditorActions>((set) => ({
  tabs: [],
  activeTabId: null,
  activeGroup1TabId: null,
  activeGroup2TabId: null,
  splitMode: false,
  projectPath: null,
  diffMode: false,
  diffLeftTabId: null,
  diffRightTabId: null,

  createTab: (title = 'Untitled', language, filePath, group = 1, encoding = 'UTF-8', initialContent = '', lineEnding?: LineEnding) => {
    const lang = language || getLanguageFromFileName(title);
    const id = generateId();
    const newTab: EditorTab = {
      id,
      title,
      kind: 'editor',
      language: lang,
      isDirty: false,
      revision: 0,
      loadState: 'ready',
      filePath,
      encoding,
      group,
      initialContent,
      lineEnding,
    };
    set((state) => {
      const nextTabs = [...state.tabs, newTab];
      const nextActive = newTab.id;
      return {
        tabs: nextTabs,
        activeTabId: nextActive,
        activeGroup1TabId: group === 1 ? nextActive : state.activeGroup1TabId,
        activeGroup2TabId: group === 2 ? nextActive : state.activeGroup2TabId,
      };
    });
    return newTab;
  },

  createVirtualTab: (title, kind, group = 1) => {
    const id = generateId();
    const newTab: EditorTab = {
      id,
      title,
      kind,
      language: 'plaintext',
      isDirty: false,
      revision: 0,
      loadState: 'ready',
      encoding: 'UTF-8',
      group,
      initialContent: '',
      lineEnding: 'LF',
    };
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: id,
      activeGroup1TabId: group === 1 ? id : state.activeGroup1TabId,
      activeGroup2TabId: group === 2 ? id : state.activeGroup2TabId,
    }));
    return newTab;
  },

  markTabDirty: (tabId, isDirty) => {
    set((state) => {
      const current = state.tabs.find((tab) => tab.id === tabId);
      if (!current || current.isDirty === isDirty) return state;
      return {
        tabs: state.tabs.map((tab) => (
          tab.id === tabId
            ? { ...tab, isDirty, revision: isDirty ? (tab.revision ?? 0) + 1 : tab.revision }
            : tab
        )),
      };
    });
  },

  closeTab: (tabId) => {
    deleteEditorState(tabId);
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      const closedGroup = tab?.group || 1;
      const oldGroupTabs = state.tabs.filter((candidate) => (candidate.group || 1) === closedGroup);
      const closedGroupIndex = oldGroupTabs.findIndex((candidate) => candidate.id === tabId);
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      const pickAdjacent = (candidates: EditorTab[]) => {
        if (candidates.length === 0) return null;
        const index = Math.min(Math.max(closedGroupIndex, 0), candidates.length - 1);
        return candidates[index]?.id ?? null;
      };

      let nextActiveTabId = state.activeTabId;
      let nextActiveGroup1Id = state.activeGroup1TabId;
      let nextActiveGroup2Id = state.activeGroup2TabId;

      if (state.activeGroup1TabId === tabId) {
        const g1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
        nextActiveGroup1Id = pickAdjacent(g1Tabs);
      }
      if (state.activeGroup2TabId === tabId) {
        const g2Tabs = newTabs.filter((t) => t.group === 2);
        nextActiveGroup2Id = pickAdjacent(g2Tabs);
      }

      if (state.activeTabId === tabId) {
        if (closedGroup === 1) {
          const g1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
          if (g1Tabs.length > 0) nextActiveTabId = pickAdjacent(g1Tabs);
          else if (nextActiveGroup2Id) nextActiveTabId = nextActiveGroup2Id;
          else nextActiveTabId = null;
        } else {
          const g2Tabs = newTabs.filter((t) => t.group === 2);
          if (g2Tabs.length > 0) nextActiveTabId = pickAdjacent(g2Tabs);
          else {
            const g1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
            nextActiveTabId = g1Tabs[g1Tabs.length - 1]?.id || null;
          }
        }
      }

      return {
        tabs: newTabs,
        activeTabId: nextActiveTabId,
        activeGroup1TabId: nextActiveGroup1Id,
        activeGroup2TabId: nextActiveGroup2Id,
        splitMode: newTabs.length < 2 ? false : state.splitMode,
      };
    });
  },

  closeTabs: (idsToClose) => {
    if (idsToClose.length === 0) return;
    for (const id of idsToClose) {
      deleteEditorState(id);
    }
    set((state) => {
      const newTabs = state.tabs.filter((t) => !idsToClose.includes(t.id));
      const g1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
      const g2Tabs = newTabs.filter((t) => t.group === 2);

      let nextActiveTabId = state.activeTabId;
      let nextActiveGroup1Id = state.activeGroup1TabId;
      let nextActiveGroup2Id = state.activeGroup2TabId;

      if (state.activeGroup1TabId && idsToClose.includes(state.activeGroup1TabId)) {
        nextActiveGroup1Id = g1Tabs[g1Tabs.length - 1]?.id || null;
      }
      if (state.activeGroup2TabId && idsToClose.includes(state.activeGroup2TabId)) {
        nextActiveGroup2Id = g2Tabs[g2Tabs.length - 1]?.id || null;
      }

      if (state.activeTabId && idsToClose.includes(state.activeTabId)) {
        if (g2Tabs.length > 0) nextActiveTabId = g2Tabs[g2Tabs.length - 1].id;
        else nextActiveTabId = g1Tabs[g1Tabs.length - 1]?.id || null;
      }

      return {
        tabs: newTabs,
        activeTabId: nextActiveTabId,
        activeGroup1TabId: nextActiveGroup1Id,
        activeGroup2TabId: nextActiveGroup2Id,
        splitMode: newTabs.length < 2 ? false : state.splitMode,
      };
    });
  },

  closeAllTabs: () => {
    set((state) => {
      for (const tab of state.tabs) {
        deleteEditorState(tab.id);
      }
      return {
        tabs: [],
        activeTabId: null,
        activeGroup1TabId: null,
        activeGroup2TabId: null,
        splitMode: false,
      };
    });
  },

  markTabSaved: (tabId) => {
    set((state) => {
      const tab = state.tabs.find((candidate) => candidate.id === tabId);
      if (tab) markEditorContentSaved(tabId, tab.encoding, tab.lineEnding);
      return {
        tabs: state.tabs.map((candidate) => (
          candidate.id === tabId ? { ...candidate, isDirty: false } : candidate
        )),
      };
    });
  },

  renameTab: (tabId, newTitle, newFilePath) => {
    const lang = getLanguageFromFileName(newTitle);
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId ? { ...tab, title: newTitle, language: lang, filePath: newFilePath || tab.filePath } : tab
      ),
    }));
  },

  setTabEncoding: (tabId, encoding) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (
        tab.id === tabId ? { ...tab, encoding, revision: (tab.revision ?? 0) + 1 } : tab
      )),
    }));
  },

  setTabLanguage: (tabId, language) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, language } : tab)),
    }));
  },

  setTabInitialContent: (tabId, content) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, initialContent: content } : tab)),
    }));
  },

  setTabLoadState: (tabId, loadState, loadError) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (
        tab.id === tabId
          ? { ...tab, loadState, loadError: loadState === 'error' ? loadError : undefined }
          : tab
      )),
    }));
  },

  setTabLargeFile: (tabId, isLargeFile) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => tab.id === tabId ? { ...tab, isLargeFile } : tab),
    }));
  },

  setTabColumnAlign: (tabId, enabled) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, columnAlignEnabled: enabled } : tab)),
    }));
  },

  setTabLineEnding: (tabId, lineEnding) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (
        tab.id === tabId ? { ...tab, lineEnding, revision: (tab.revision ?? 0) + 1 } : tab
      )),
    }));
  },

  moveTabToGroup: (tabId, group) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || (tab.group || 1) === group) return state;

      const sourceGroup = tab.group || 1;
      const newTabs = state.tabs.map((t) => (t.id === tabId ? { ...t, group } : t));

      let nextActiveGroup1Id = state.activeGroup1TabId;
      let nextActiveGroup2Id = state.activeGroup2TabId;

      // If the moved tab was the active tab of the source group,
      // switch the source group to another remaining tab.
      if (sourceGroup === 1 && state.activeGroup1TabId === tabId) {
        const g1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
        nextActiveGroup1Id = g1Tabs[g1Tabs.length - 1]?.id || null;
      }
      if (sourceGroup === 2 && state.activeGroup2TabId === tabId) {
        const g2Tabs = newTabs.filter((t) => t.group === 2);
        nextActiveGroup2Id = g2Tabs[g2Tabs.length - 1]?.id || null;
      }

      // Activate the moved tab in the target group.
      if (group === 1) {
        nextActiveGroup1Id = tabId;
      } else {
        nextActiveGroup2Id = tabId;
      }

      return {
        tabs: newTabs,
        activeTabId: tabId,
        activeGroup1TabId: nextActiveGroup1Id,
        activeGroup2TabId: nextActiveGroup2Id,
      };
    });
  },

  reorderTab: (tabId, group, targetGroupIndex) => {
    set((state) => {
      const currentGlobalIndex = state.tabs.findIndex((t) => t.id === tabId);
      if (currentGlobalIndex === -1) return state;

      const groupTabs =
        group === 1
          ? state.tabs.filter((t) => t.group === 1 || !t.group)
          : state.tabs.filter((t) => t.group === 2);
      const currentGroupIndex = groupTabs.findIndex((t) => t.id === tabId);

      // No-op when dropped on current position or immediate right edge
      if (targetGroupIndex === currentGroupIndex || targetGroupIndex === currentGroupIndex + 1) {
        return state;
      }

      const movedTab = state.tabs[currentGlobalIndex];
      const newTabs = state.tabs.filter((t) => t.id !== tabId);

      // Walk newTabs to find the global index that corresponds to
      // targetGroupIndex within this group.
      let insertGlobalIndex = -1;
      let groupCount = 0;
      for (let i = 0; i < newTabs.length; i++) {
        const g = newTabs[i].group || 1;
        if (g === group) {
          if (groupCount === targetGroupIndex) {
            insertGlobalIndex = i;
            break;
          }
          groupCount++;
        }
      }
      if (insertGlobalIndex === -1) {
        insertGlobalIndex = newTabs.length;
      }

      newTabs.splice(insertGlobalIndex, 0, movedTab);
      return { tabs: newTabs };
    });
  },

  setSplitMode: (mode) => {
    set((state) => {
      if (mode && state.tabs.length < 2) return state;
      if (!mode) {
        return {
          splitMode: false,
          tabs: state.tabs.map((t) => ({ ...t, group: 1 as const })),
          activeGroup1TabId: state.activeTabId,
          activeGroup2TabId: null,
        };
      }
      const hasGroup2 = state.tabs.some((t) => t.group === 2);
      let nextTabs = state.tabs;
      let nextActiveGroup2Id = state.activeGroup2TabId;
      let nextActiveGroup1Id = state.activeGroup1TabId;
      if (!hasGroup2 && state.tabs.length >= 2 && state.activeTabId) {
        // Move current active tab to group2, and pick another tab for group1
        nextTabs = state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, group: 2 as const } : t));
        nextActiveGroup2Id = state.activeTabId;
        const g1Tabs = nextTabs.filter((t) => t.id !== state.activeTabId && (t.group === 1 || !t.group));
        nextActiveGroup1Id = g1Tabs[g1Tabs.length - 1]?.id || null;
      }
      return {
        splitMode: true,
        tabs: nextTabs,
        activeGroup1TabId: nextActiveGroup1Id,
        activeGroup2TabId: nextActiveGroup2Id || state.activeTabId,
      };
    });
  },

  setActiveTabId: (id) =>
    set((state) => {
      if (!id) return { activeTabId: null };
      const tab = state.tabs.find((t) => t.id === id);
      const group = tab?.group || 1;
      return {
        activeTabId: id,
        activeGroup1TabId: group === 1 ? id : state.activeGroup1TabId,
        activeGroup2TabId: group === 2 ? id : state.activeGroup2TabId,
      };
    }),
  setActiveGroup1TabId: (id) => set({ activeGroup1TabId: id }),
  setActiveGroup2TabId: (id) => set({ activeGroup2TabId: id }),

  setProjectPath: (path) => set({ projectPath: path }),
  setDiffMode: (mode) => set({ diffMode: mode }),
  setDiffPair: (left, right) => set({ diffLeftTabId: left, diffRightTabId: right }),
}));

export { useEditorStore };
