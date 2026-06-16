import { create } from 'zustand';
import { debounce } from '../utils/debounce';

const UI_KEY = 'te2-ui';

function loadUI(): Partial<UIState> {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveUI(state: UIState & UIActions) {
  try {
    localStorage.setItem(
      UI_KEY,
      JSON.stringify({
        sidebarVisible: state.sidebarVisible,
        findReplaceVisible: state.findReplaceVisible,
        previewVisible: state.previewVisible,
        previewFullScreen: state.previewFullScreen,
        diagnosticsPanelVisible: state.diagnosticsPanelVisible,
        jsonFormVisible: state.jsonFormVisible,
      })
    );
  } catch {
    // ignore
  }
}

interface UIState {
  sidebarVisible: boolean;
  findReplaceVisible: boolean;
  previewVisible: boolean;
  previewFullScreen: boolean;
  diagnosticsPanelVisible: boolean;
  readMode: boolean;
  jsonFormVisible: boolean;
  jsonFormFullScreen: boolean;
}

interface UIActions {
  setSidebarVisible: (visible: boolean) => void;
  setFindReplaceVisible: (visible: boolean) => void;
  setPreviewVisible: (visible: boolean) => void;
  setPreviewFullScreen: (full: boolean) => void;
  setDiagnosticsPanelVisible: (visible: boolean) => void;
  setReadMode: (mode: boolean) => void;
  setJsonFormVisible: (visible: boolean) => void;
  setJsonFormFullScreen: (full: boolean) => void;
  toggleSidebar: () => void;
  toggleFindReplace: () => void;
  togglePreview: () => void;
  toggleDiagnosticsPanel: () => void;
  toggleReadMode: () => void;
  toggleJsonForm: () => void;
}

const loadedUI = loadUI();

const useUIStore = create<UIState & UIActions>((set) => ({
  sidebarVisible: loadedUI.sidebarVisible ?? true,
  findReplaceVisible: loadedUI.findReplaceVisible ?? false,
  previewVisible: loadedUI.previewVisible ?? false,
  previewFullScreen: loadedUI.previewFullScreen ?? false,
  diagnosticsPanelVisible: false,
  readMode: false,
  jsonFormVisible: false,
  jsonFormFullScreen: false,

  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setFindReplaceVisible: (visible) => set({ findReplaceVisible: visible }),
  setPreviewVisible: (visible) => set((state) => ({
    previewVisible: visible,
    previewFullScreen: visible ? state.previewFullScreen : false,
  })),
  setPreviewFullScreen: (full) => set({ previewFullScreen: full }),
  setDiagnosticsPanelVisible: (visible) => set({ diagnosticsPanelVisible: visible }),
  setReadMode: (mode) => set({ readMode: mode }),
  setJsonFormVisible: (visible) => set({ jsonFormVisible: visible, jsonFormFullScreen: false }),
  setJsonFormFullScreen: (full) => set({ jsonFormFullScreen: full }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleFindReplace: () => set((state) => ({ findReplaceVisible: !state.findReplaceVisible })),
  togglePreview: () => set((state) => ({ previewVisible: !state.previewVisible, previewFullScreen: state.previewVisible ? false : state.previewFullScreen })),
  toggleDiagnosticsPanel: () => set((state) => ({ diagnosticsPanelVisible: !state.diagnosticsPanelVisible })),
  toggleReadMode: () => set((state) => ({ readMode: !state.readMode })),
  toggleJsonForm: () => set((state) => ({ jsonFormVisible: !state.jsonFormVisible, jsonFormFullScreen: false })),
}));

useUIStore.subscribe(debounce(saveUI, 300));

export { useUIStore };
export type { UIState, UIActions };
