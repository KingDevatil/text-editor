import { create } from 'zustand';
import type { EditorTab, Language, Encoding, ThemeMode, PartialThemeColors, ThemeColors } from '../types';
import { EXT_TO_LANGUAGE } from '../types';
import { deleteEditorState } from './useEditorStatePool';
import { debounce } from '../utils/debounce';

let tabCounter = 0;

function generateId(): string {
  return `tab-${++tabCounter}-${Date.now()}`;
}

function getLanguageFromFileName(fileName: string): Language {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

const SETTINGS_KEY = 'te2-settings';

interface PersistedSettings {
  theme?: 'vs' | 'vs-dark' | 'light' | 'dark' | 'custom';
  lightCustomColors?: PartialThemeColors;
  darkCustomColors?: PartialThemeColors;
  customColors?: PartialThemeColors;
  sidebarVisible?: boolean;
  findReplaceVisible?: boolean;
  unicodeHighlight?: boolean;
  fontSize?: number;
  previewVisible?: boolean;
  largeFileOptimize?: boolean;
  wordWrap?: boolean;
  showWhitespace?: boolean;
  scrollPastEnd?: boolean;
  minimapVisible?: boolean;
  readMode?: boolean;
  readerTocVisible?: boolean;
  customKeybindings?: Record<string, string>;
}

function migrateThemeMode(theme: string | undefined): ThemeMode {
  if (theme === 'vs') return 'light';
  if (theme === 'vs-dark') return 'dark';
  if (theme === 'light' || theme === 'dark' || theme === 'custom') return theme;
  return 'dark';
}

function loadSettings(): PersistedSettings {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings(state: EditorState & EditorActions) {
  try {
    const payload: PersistedSettings = {
      theme: state.theme,
      lightCustomColors: state.lightCustomColors,
      darkCustomColors: state.darkCustomColors,
      customColors: state.customColors,
      sidebarVisible: state.sidebarVisible,
      findReplaceVisible: state.findReplaceVisible,
      unicodeHighlight: state.unicodeHighlight,
      fontSize: state.fontSize,
      previewVisible: state.previewVisible,
      largeFileOptimize: state.largeFileOptimize,
      wordWrap: state.wordWrap,
      showWhitespace: state.showWhitespace,
      scrollPastEnd: state.scrollPastEnd,
      minimapVisible: state.minimapVisible,
      readMode: state.readMode,
      readerTocVisible: state.readerTocVisible,
      customKeybindings: state.customKeybindings,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  activeGroup1TabId: string | null;
  activeGroup2TabId: string | null;
  theme: ThemeMode;
  lightCustomColors: PartialThemeColors;
  darkCustomColors: PartialThemeColors;
  customColors: PartialThemeColors;
  sidebarVisible: boolean;
  findReplaceVisible: boolean;
  unicodeHighlight: boolean;
  fontSize: number;
  previewVisible: boolean;
  splitMode: boolean;
  projectPath: string | null;
  largeFileOptimize: boolean;
  readerTocVisible: boolean;
}

interface EditorActions {
  createTab: (title?: string, language?: Language, filePath?: string, group?: 1 | 2, encoding?: Encoding, initialContent?: string) => EditorTab;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  closeTab: (tabId: string) => void;
  closeTabs: (idsToClose: string[]) => void;
  closeAllTabs: () => void;
  markTabSaved: (tabId: string) => void;
  renameTab: (tabId: string, newTitle: string, newFilePath?: string) => void;
  setTabEncoding: (tabId: string, encoding: Encoding) => void;
  setTabLanguage: (tabId: string, language: Language) => void;
  moveTabToGroup: (tabId: string, group: 1 | 2) => void;
  reorderTab: (tabId: string, group: 1 | 2, targetGroupIndex: number) => void;
  setSplitMode: (mode: boolean) => void;
  setActiveTabId: (id: string | null) => void;
  setActiveGroup1TabId: (id: string | null) => void;
  setActiveGroup2TabId: (id: string | null) => void;
  setTheme: (theme: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => void;
  setLightCustomColor: (key: keyof ThemeColors, value: string) => void;
  setDarkCustomColor: (key: keyof ThemeColors, value: string) => void;
  setCustomColor: (key: keyof ThemeColors, value: string) => void;
  resetLightCustomColors: () => void;
  resetDarkCustomColors: () => void;
  resetCustomColors: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setFindReplaceVisible: (visible: boolean) => void;
  setUnicodeHighlight: (highlight: boolean) => void;
  setFontSize: (size: number) => void;
  setPreviewVisible: (visible: boolean) => void;
  setProjectPath: (path: string | null) => void;
  setLargeFileOptimize: (optimize: boolean) => void;
  wordWrap: boolean;
  setWordWrap: (wrap: boolean) => void;
  showWhitespace: boolean;
  setShowWhitespace: (show: boolean) => void;
  scrollPastEnd: boolean;
  setScrollPastEnd: (scroll: boolean) => void;
  minimapVisible: boolean;
  setMinimapVisible: (visible: boolean) => void;
  setReaderTocVisible: (visible: boolean) => void;
  diffMode: boolean;
  diffLeftTabId: string | null;
  diffRightTabId: string | null;
  setDiffMode: (mode: boolean) => void;
  setDiffPair: (left: string | null, right: string | null) => void;
  readMode: boolean;
  setReadMode: (mode: boolean) => void;
  customKeybindings: Record<string, string>;
  setCustomKeybinding: (command: string, key: string) => void;
  resetKeybindings: () => void;
}

const loaded = loadSettings();

const useEditorStore = create<EditorState & EditorActions>((set) => ({
  tabs: [],
  activeTabId: null,
  activeGroup1TabId: null,
  activeGroup2TabId: null,
  theme: migrateThemeMode(loaded.theme) ?? 'dark',
  lightCustomColors: loaded.lightCustomColors ?? {},
  darkCustomColors: loaded.darkCustomColors ?? {},
  customColors: loaded.customColors ?? {},
  sidebarVisible: loaded.sidebarVisible ?? true,
  findReplaceVisible: loaded.findReplaceVisible ?? false,
  unicodeHighlight: loaded.unicodeHighlight ?? false,
  fontSize: loaded.fontSize ?? 14,
  previewVisible: loaded.previewVisible ?? false,
  splitMode: false,
  projectPath: null,
  largeFileOptimize: loaded.largeFileOptimize ?? false,
  wordWrap: loaded.wordWrap ?? false,
  showWhitespace: loaded.showWhitespace ?? false,
  scrollPastEnd: loaded.scrollPastEnd ?? true,
  minimapVisible: loaded.minimapVisible ?? true,
  readerTocVisible: loaded.readerTocVisible ?? true,
  diffMode: false,
  diffLeftTabId: null,
  diffRightTabId: null,
  readMode: false,
  customKeybindings: {},

  createTab: (title = 'Untitled', language, filePath, group = 1, encoding = 'UTF-8', initialContent = '') => {
    const lang = language || getLanguageFromFileName(title);
    const id = generateId();
    const newTab: EditorTab = {
      id,
      title,
      language: lang,
      isDirty: false,
      filePath,
      encoding,
      group,
      initialContent,
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

  markTabDirty: (tabId, isDirty) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, isDirty } : tab)),
    }));
  },

  closeTab: (tabId) => {
    deleteEditorState(tabId);
    set((state) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      const closedGroup = tab?.group || 1;
      const newTabs = state.tabs.filter((t) => t.id !== tabId);

      let nextActiveTabId = state.activeTabId;
      let nextActiveGroup1Id = state.activeGroup1TabId;
      let nextActiveGroup2Id = state.activeGroup2TabId;

      if (state.activeGroup1TabId === tabId) {
        const g1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
        nextActiveGroup1Id = g1Tabs[g1Tabs.length - 1]?.id || null;
      }
      if (state.activeGroup2TabId === tabId) {
        const g2Tabs = newTabs.filter((t) => t.group === 2);
        nextActiveGroup2Id = g2Tabs[g2Tabs.length - 1]?.id || null;
      }

      if (state.activeTabId === tabId) {
        if (closedGroup === 1) {
          const g1Tabs = newTabs.filter((t) => t.group === 1 || !t.group);
          if (g1Tabs.length > 0) nextActiveTabId = g1Tabs[g1Tabs.length - 1].id;
          else if (nextActiveGroup2Id) nextActiveTabId = nextActiveGroup2Id;
          else nextActiveTabId = null;
        } else {
          const g2Tabs = newTabs.filter((t) => t.group === 2);
          if (g2Tabs.length > 0) nextActiveTabId = g2Tabs[g2Tabs.length - 1].id;
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
        previewVisible: false,
      };
    });
  },

  markTabSaved: (tabId) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, isDirty: false } : tab)),
    }));
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
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, encoding } : tab)),
    }));
  },

  setTabLanguage: (tabId, language) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, language } : tab)),
    }));
  },

  moveTabToGroup: (tabId, group) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, group } : tab)),
      activeTabId: tabId,
      activeGroup1TabId: group === 1 ? tabId : state.activeGroup1TabId,
      activeGroup2TabId: group === 2 ? tabId : state.activeGroup2TabId,
    }));
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
        previewVisible: false,
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

  setTheme: (theme) => {
    if (typeof theme === 'function') {
      set((state) => ({ theme: theme(state.theme) }));
    } else {
      set({ theme });
    }
  },

  setLightCustomColor: (key, value) =>
    set((state) => ({
      lightCustomColors: { ...state.lightCustomColors, [key]: value },
    })),

  setDarkCustomColor: (key, value) =>
    set((state) => ({
      darkCustomColors: { ...state.darkCustomColors, [key]: value },
    })),

  setCustomColor: (key, value) =>
    set((state) => ({
      customColors: { ...state.customColors, [key]: value },
    })),

  resetLightCustomColors: () => set({ lightCustomColors: {} }),
  resetDarkCustomColors: () => set({ darkCustomColors: {} }),
  resetCustomColors: () => set({ customColors: {} }),

  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setFindReplaceVisible: (visible) => set({ findReplaceVisible: visible }),
  setUnicodeHighlight: (highlight) => set({ unicodeHighlight: highlight }),
  setFontSize: (size) => set({ fontSize: size }),
  setPreviewVisible: (visible) => set({ previewVisible: visible }),
  setProjectPath: (path) => set({ projectPath: path }),
  setLargeFileOptimize: (optimize) => set({ largeFileOptimize: optimize }),
  setWordWrap: (wrap) => set({ wordWrap: wrap }),
  setShowWhitespace: (show) => set({ showWhitespace: show }),
  setScrollPastEnd: (scroll) => set({ scrollPastEnd: scroll }),
  setMinimapVisible: (visible) => set({ minimapVisible: visible }),
  setReaderTocVisible: (visible) => set({ readerTocVisible: visible }),
  setDiffMode: (mode) => set({ diffMode: mode }),
  setDiffPair: (left, right) => set({ diffLeftTabId: left, diffRightTabId: right }),
  setReadMode: (mode) => set({ readMode: mode }),
  setCustomKeybinding: (command, key) =>
    set((state) => ({
      customKeybindings: { ...state.customKeybindings, [command]: key },
    })),
  resetKeybindings: () => set({ customKeybindings: {} }),
}));

useEditorStore.subscribe(debounce(saveSettings, 300));

export { useEditorStore };
