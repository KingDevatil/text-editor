import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { classHighlighter } from '@lezer/highlight';
import type { ThemeColors } from '../types';

export type EditorTheme = 'light' | 'dark' | 'custom';

function deriveFocusedSelection(selection: string): string {
  const rgba = selection.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (rgba) {
    const r = rgba[1], g = rgba[2], b = rgba[3];
    const a = parseFloat(rgba[4]);
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, parseFloat((a + 0.12).toFixed(2)))})`;
  }
  return selection;
}

/**
 * Syntax highlighting via CSS classes (tok-keyword, tok-string, etc.).
 * Colors are defined in index.css for both light and dark themes.
 */
export const syntaxHighlightExtension: Extension = syntaxHighlighting(classHighlighter);

/**
 * Build a dynamic CodeMirror 6 theme from ThemeColors.
 */
export function buildDynamicTheme(colors: ThemeColors, isDark: boolean = false): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: colors.bgPrimary,
        color: colors.textPrimary,
      },
      '.cm-content': {
        caretColor: colors.editorCursor,
        fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
        fontSize: '14px',
        lineHeight: '1.5',
      },
      '.cm-gutters': {
        backgroundColor: colors.editorGutterBg,
        color: colors.editorGutterText,
        borderRight: `1px solid ${colors.border}`,
      },
      '.cm-activeLineGutter': {
        backgroundColor: colors.editorGutterBg,
        color: colors.textPrimary,
      },
      '.cm-matchingBracket': {
        backgroundColor: `${colors.editorBracketMatch}40`,
        borderBottom: `2px solid ${colors.editorBracketMatch}`,
      },
      '.cm-bracket-marker': {
        color: colors.editorBracketMatch,
      },
      '.cm-activeLine': {
        backgroundColor: colors.editorActiveLine,
      },
      '.cm-selectionBackground': {
        backgroundColor: colors.editorSelection,
      },
      '.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
        backgroundColor: deriveFocusedSelection(colors.editorSelection),
      },
      '.cm-selectionMatch': {
        backgroundColor: colors.editorSelectionMatch,
      },
      '.cm-selectionMatch-main': {
        backgroundColor: colors.editorSelectionMatch,
      },
      '.cm-searchMatch': {
        backgroundColor: colors.editorMatchHighlight,
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: colors.editorSearchMatchActiveBg,
        color: colors.editorSearchMatchActiveText,
      },
      // Log severity colors
      '.cm-log-error': { color: colors.error, fontWeight: 'bold' },
      '.cm-log-warn': { color: colors.warning, fontWeight: 'bold' },
      '.cm-log-info': { color: colors.primary, fontWeight: 'bold' },
      '.cm-log-debug': { color: colors.textSecondary },
    },
    { dark: isDark }
  );
}

/**
 * Light theme ("light") — white background, dark text.
 * Kept for reference; actual light theme is generated via buildDynamicTheme.
 */
export const lightTheme: Extension = EditorView.theme(
  {
    '&': { backgroundColor: '#ffffff', color: '#333333' },
    '.cm-content': {
      caretColor: '#000000',
      fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      fontSize: '14px',
      lineHeight: '1.5',
    },
    '.cm-gutters': { backgroundColor: '#f5f5f5', color: '#6e7681', borderRight: '1px solid #e0e0e0' },
    '.cm-activeLineGutter': { backgroundColor: '#e8e8e8', color: '#333333' },
    '.cm-activeLine': { backgroundColor: '#f5f8fa' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(128, 128, 128, 0.25)' },
    '.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'rgba(128, 128, 128, 0.35)',
    },
    '.cm-searchMatch': { backgroundColor: '#a8ac94' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#ffd700' },
    '.cm-log-error': { color: '#d32f2f', fontWeight: 'bold' },
    '.cm-log-warn': { color: '#f57c00', fontWeight: 'bold' },
    '.cm-log-info': { color: '#1976d2', fontWeight: 'bold' },
    '.cm-log-debug': { color: '#616161' },
  },
  { dark: false }
);

/**
 * Dark theme ("dark") — dark background, light text.
 * Kept for reference; actual dark theme is generated via buildDynamicTheme.
 */
export const darkTheme: Extension = EditorView.theme(
  {
    '&': { backgroundColor: '#1e1e1e', color: '#d4d4d4' },
    '.cm-content': {
      caretColor: '#d4d4d4',
      fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      fontSize: '14px',
      lineHeight: '1.5',
    },
    '.cm-gutters': { backgroundColor: '#252526', color: '#858585', borderRight: '1px solid #333333' },
    '.cm-activeLineGutter': { backgroundColor: '#2c2c2d', color: '#c6c6c6' },
    '.cm-activeLine': { backgroundColor: '#222426' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(160, 160, 160, 0.3)' },
    '.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'rgba(160, 160, 160, 0.45)',
    },
    '.cm-searchMatch': { backgroundColor: '#515c6a' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#ffd700' },
    '.cm-log-error': { color: '#f48771', fontWeight: 'bold' },
    '.cm-log-warn': { color: '#dcdcaa', fontWeight: 'bold' },
    '.cm-log-info': { color: '#4fc1ff', fontWeight: 'bold' },
    '.cm-log-debug': { color: '#808080' },
  },
  { dark: true }
);

export function getThemeExtension(theme: EditorTheme): Extension {
  switch (theme) {
    case 'light':
      return lightTheme;
    case 'dark':
      return darkTheme;
    case 'custom':
      return darkTheme;
    default:
      return darkTheme;
  }
}
