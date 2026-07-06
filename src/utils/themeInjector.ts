import type { ThemeColors } from '../types';
import { defaultLightColors, defaultDarkColors, defaultCustomColors } from './themeDefaults';

function deriveFocusedSelection(selection: string): string {
  const rgba = selection.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (rgba) {
    const r = rgba[1], g = rgba[2], b = rgba[3];
    const a = parseFloat(rgba[4]);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, parseFloat((a + 0.12).toFixed(2)))})`;
  }
  return selection;
}

export function injectThemeVars(colors: ThemeColors): void {
  let style = document.getElementById('te-theme-vars') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'te-theme-vars';
    document.head.appendChild(style);
  }
  style.textContent = `:root {
    --te-bg-primary: ${colors.bgPrimary};
    --te-bg-secondary: ${colors.bgSecondary};
    --te-bg-tertiary: ${colors.bgTertiary};
    --te-text-primary: ${colors.textPrimary};
    --te-text-secondary: ${colors.textSecondary};
    --te-border: ${colors.border};
    --te-primary: ${colors.primary};
    --te-primary-text: ${colors.primaryText};
    --te-success: ${colors.success};
    --te-warning: ${colors.warning};
    --te-error: ${colors.error};
    --te-editor-gutter-bg: ${colors.editorGutterBg};
    --te-editor-gutter-text: ${colors.editorGutterText};
    --te-editor-cursor: ${colors.editorCursor};
    --te-editor-selection: ${colors.editorSelection};
    --te-editor-selection-focused: ${deriveFocusedSelection(colors.editorSelection)};
    --te-editor-active-line: ${colors.editorActiveLine};
    --te-editor-match-highlight: ${colors.editorMatchHighlight};
    --te-editor-selection-match: ${colors.editorSelectionMatch};
    --te-editor-search-match-active-bg: ${colors.editorSearchMatchActiveBg};
    --te-editor-search-match-active-text: ${colors.editorSearchMatchActiveText};
    --te-tab-active-bg: ${colors.tabActiveBg};
    --te-scrollbar-thumb: ${colors.scrollbarThumb};
    --te-scrollbar-thumb-hover: ${colors.scrollbarThumbHover};
  }
  .cm-editor .cm-content {
    caret-color: ${colors.editorCursor} !important;
  }
  .cm-editor .cm-cursor {
    border-left-color: ${colors.editorCursor} !important;
  }`;
  window.dispatchEvent(new CustomEvent('te-theme-change'));
}

/**
 * Apply saved theme colors from settings store.
 * Called by App.tsx after settings initialization to avoid flash of wrong theme.
 */
export function applySavedTheme(): void {
  if (typeof document === 'undefined') return;
  try {
    const raw = localStorage.getItem('te2-prefs') || localStorage.getItem('te2-settings') || '{}';
    const saved = JSON.parse(raw);
    const theme = saved.theme || 'dark';
    if (theme === 'light') {
      injectThemeVars({ ...defaultLightColors, ...saved.lightCustomColors });
    } else if (theme === 'custom') {
      injectThemeVars({ ...defaultCustomColors, ...saved.customColors });
    } else {
      injectThemeVars({ ...defaultDarkColors, ...saved.darkCustomColors });
    }
  } catch {
    injectThemeVars(defaultDarkColors);
  }
}
