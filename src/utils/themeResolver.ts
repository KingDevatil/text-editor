import type { ThemeMode, ThemeColors, PartialThemeColors, SyntaxHighlightMode } from '../types';
import { defaultLightColors, defaultDarkColors, defaultCustomColors } from './themeDefaults';

export function resolveThemeColors(
  theme: ThemeMode,
  lightCustom: PartialThemeColors,
  darkCustom: PartialThemeColors,
  customColors: PartialThemeColors
): ThemeColors {
  if (theme === 'light') {
    return { ...defaultLightColors, ...lightCustom };
  }
  if (theme === 'dark') {
    return { ...defaultDarkColors, ...darkCustom };
  }
  return { ...defaultCustomColors, ...customColors };
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const value = hex[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  const rgb = color.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
    };
  }

  return null;
}

function toLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function isThemeDark(theme: ThemeMode, colors: ThemeColors): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;

  const rgb = parseRgb(colors.bgPrimary);
  if (!rgb) return false;

  const luminance =
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b);

  return luminance < 0.45;
}

export function isSyntaxHighlightDark(
  theme: ThemeMode,
  colors: ThemeColors,
  customSyntaxHighlight: SyntaxHighlightMode = 'auto'
): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (customSyntaxHighlight === 'dark') return true;
  if (customSyntaxHighlight === 'light') return false;
  return isThemeDark(theme, colors);
}
