import { create } from 'zustand';
import type { ThemeMode, PartialThemeColors, ThemeColors, SyntaxHighlightMode } from '../types';
import { debounce } from '../utils/debounce';

/** Custom color format definition */
export interface CustomColorFormat {
  /** Unique identifier for the format */
  id: string;
  /** Display name for the format */
  name: string;
  /** Regular expression pattern to match the color value */
  pattern: string;
  /** Index of the capture group that contains the hex color value (default: 1) */
  extractGroup?: number;
  /** Whether this format is enabled */
  enabled: boolean;
}

const SETTINGS_KEY = 'te2-prefs';
const LEGACY_SETTINGS_KEY = 'te2-settings';

interface SettingsState {
  theme: ThemeMode;
  lightCustomColors: PartialThemeColors;
  darkCustomColors: PartialThemeColors;
  customColors: PartialThemeColors;
  customSyntaxHighlight: SyntaxHighlightMode;
  fontSize: number;
  wordWrap: boolean;
  showWhitespace: boolean;
  scrollPastEnd: boolean;
  minimapVisible: boolean;
  largeFileOptimize: boolean;
  unicodeHighlight: boolean;
  columnAlignSupported: boolean;
  readerTocVisible: boolean;
  customKeybindings: Record<string, string>;
  customColorFormats: CustomColorFormat[];
}

interface SettingsActions {
  setTheme: (theme: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => void;
  setLightCustomColor: (key: keyof ThemeColors, value: string) => void;
  setDarkCustomColor: (key: keyof ThemeColors, value: string) => void;
  setCustomColor: (key: keyof ThemeColors, value: string) => void;
  setCustomSyntaxHighlight: (mode: SyntaxHighlightMode) => void;
  resetLightCustomColors: () => void;
  resetDarkCustomColors: () => void;
  resetCustomColors: () => void;
  setFontSize: (size: number) => void;
  setWordWrap: (wrap: boolean) => void;
  setShowWhitespace: (show: boolean) => void;
  setScrollPastEnd: (scroll: boolean) => void;
  setMinimapVisible: (visible: boolean) => void;
  setLargeFileOptimize: (optimize: boolean) => void;
  setUnicodeHighlight: (highlight: boolean) => void;
  setColumnAlignSupported: (supported: boolean) => void;
  setReaderTocVisible: (visible: boolean) => void;
  setCustomKeybinding: (command: string, key: string) => void;
  resetKeybindings: () => void;
  addCustomColorFormat: (format: CustomColorFormat) => void;
  updateCustomColorFormat: (id: string, updates: Partial<CustomColorFormat>) => void;
  removeCustomColorFormat: (id: string) => void;
  toggleCustomColorFormat: (id: string) => void;
}

function migrateThemeMode(theme: string | undefined): ThemeMode {
  if (theme === 'vs') return 'light';
  if (theme === 'vs-dark') return 'dark';
  if (theme === 'light' || theme === 'dark' || theme === 'custom') return theme;
  return 'dark';
}

function loadSettings(): Partial<SettingsState> {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
    // Migrate from legacy key on first run
    const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      // Save to new key immediately so next run uses it
      localStorage.setItem(SETTINGS_KEY, legacy);
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

const loaded = loadSettings();

const useSettingsStore = create<SettingsState & SettingsActions>((set) => ({
  theme: migrateThemeMode(loaded.theme) ?? 'dark',
  lightCustomColors: loaded.lightCustomColors ?? {},
  darkCustomColors: loaded.darkCustomColors ?? {},
  customColors: loaded.customColors ?? {},
  customSyntaxHighlight: loaded.customSyntaxHighlight ?? 'auto',
  fontSize: loaded.fontSize ?? 14,
  wordWrap: loaded.wordWrap ?? false,
  showWhitespace: loaded.showWhitespace ?? false,
  scrollPastEnd: loaded.scrollPastEnd ?? true,
  minimapVisible: loaded.minimapVisible ?? true,
  largeFileOptimize: loaded.largeFileOptimize ?? false,
  unicodeHighlight: loaded.unicodeHighlight ?? false,
  columnAlignSupported: loaded.columnAlignSupported ?? false,
  readerTocVisible: loaded.readerTocVisible ?? true,
  customKeybindings: loaded.customKeybindings ?? {},
  customColorFormats: loaded.customColorFormats ?? [],

  setTheme: (theme) => {
    if (typeof theme === 'function') {
      set((state) => ({ theme: theme(state.theme) }));
    } else {
      set({ theme });
    }
  },
  setLightCustomColor: (key, value) =>
    set((state) => ({ lightCustomColors: { ...state.lightCustomColors, [key]: value } })),
  setDarkCustomColor: (key, value) =>
    set((state) => ({ darkCustomColors: { ...state.darkCustomColors, [key]: value } })),
  setCustomColor: (key, value) =>
    set((state) => ({ customColors: { ...state.customColors, [key]: value } })),
  setCustomSyntaxHighlight: (customSyntaxHighlight) => set({ customSyntaxHighlight }),
  resetLightCustomColors: () => set({ lightCustomColors: {} }),
  resetDarkCustomColors: () => set({ darkCustomColors: {} }),
  resetCustomColors: () => set({ customColors: {} }),
  setFontSize: (size) => set({ fontSize: size }),
  setWordWrap: (wrap) => set({ wordWrap: wrap }),
  setShowWhitespace: (show) => set({ showWhitespace: show }),
  setScrollPastEnd: (scroll) => set({ scrollPastEnd: scroll }),
  setMinimapVisible: (visible) => set({ minimapVisible: visible }),
  setLargeFileOptimize: (optimize) => set({ largeFileOptimize: optimize }),
  setUnicodeHighlight: (highlight) => set({ unicodeHighlight: highlight }),
  setColumnAlignSupported: (supported) => set({ columnAlignSupported: supported }),
  setReaderTocVisible: (visible) => set({ readerTocVisible: visible }),
  setCustomKeybinding: (command, key) =>
    set((state) => ({ customKeybindings: { ...state.customKeybindings, [command]: key } })),
  resetKeybindings: () => set({ customKeybindings: {} }),
  addCustomColorFormat: (format) =>
    set((state) => ({ customColorFormats: [...state.customColorFormats, format] })),
  updateCustomColorFormat: (id, updates) =>
    set((state) => ({
      customColorFormats: state.customColorFormats.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  removeCustomColorFormat: (id) =>
    set((state) => ({
      customColorFormats: state.customColorFormats.filter((f) => f.id !== id),
    })),
  toggleCustomColorFormat: (id) =>
    set((state) => ({
      customColorFormats: state.customColorFormats.map((f) =>
        f.id === id ? { ...f, enabled: !f.enabled } : f
      ),
    })),
}));

function saveSettings(state: SettingsState) {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        theme: state.theme,
        lightCustomColors: state.lightCustomColors,
        darkCustomColors: state.darkCustomColors,
        customColors: state.customColors,
        customSyntaxHighlight: state.customSyntaxHighlight,
        fontSize: state.fontSize,
        wordWrap: state.wordWrap,
        showWhitespace: state.showWhitespace,
        scrollPastEnd: state.scrollPastEnd,
        minimapVisible: state.minimapVisible,
        largeFileOptimize: state.largeFileOptimize,
        unicodeHighlight: state.unicodeHighlight,
        columnAlignSupported: state.columnAlignSupported,
        readerTocVisible: state.readerTocVisible,
        customKeybindings: state.customKeybindings,
        customColorFormats: state.customColorFormats,
      })
    );
  } catch {
    // ignore
  }
}

useSettingsStore.subscribe(debounce(saveSettings, 300));

export { useSettingsStore };
export type { SettingsState, SettingsActions };
