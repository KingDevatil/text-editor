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
        diagnosticsPanelVisible: state.diagnosticsPanelVisible,
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
  diagnosticsPanelVisible: boolean;
  readMode: boolean;
}

interface UIActions {
  setSidebarVisible: (visible: boolean) => void;
  setFindReplaceVisible: (visible: boolean) => void;
  setPreviewVisible: (visible: boolean) => void;
  setDiagnosticsPanelVisible: (visible: boolean) => void;
  setReadMode: (mode: boolean) => void;
  toggleSidebar: () => void;
  toggleFindReplace: () => void;
  togglePreview: () => void;
  toggleDiagnosticsPanel: () => void;
  toggleReadMode: () => void;
}

const loadedUI = loadUI();

const useUIStore = create<UIState & UIActions>((set) => ({
  sidebarVisible: loadedUI.sidebarVisible ?? true,
  findReplaceVisible: loadedUI.findReplaceVisible ?? false,
  previewVisible: loadedUI.previewVisible ?? false,
  diagnosticsPanelVisible: false,
  readMode: false,

  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  setFindReplaceVisible: (visible) => set({ findReplaceVisible: visible }),
  setPreviewVisible: (visible) => set({ previewVisible: visible }),
  setDiagnosticsPanelVisible: (visible) => set({ diagnosticsPanelVisible: visible }),
  setReadMode: (mode) => set({ readMode: mode }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleFindReplace: () => set((state) => ({ findReplaceVisible: !state.findReplaceVisible })),
  togglePreview: () => set((state) => ({ previewVisible: !state.previewVisible })),
  toggleDiagnosticsPanel: () => set((state) => ({ diagnosticsPanelVisible: !state.diagnosticsPanelVisible })),
  toggleReadMode: () => set((state) => ({ readMode: !state.readMode })),
}));

useUIStore.subscribe(debounce(saveUI, 300));

export { useUIStore };
export type { UIState, UIActions };
