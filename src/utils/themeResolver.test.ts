import { describe, expect, it } from 'vitest';
import { defaultCustomColors, defaultLightColors } from './themeDefaults';
import { isSyntaxHighlightDark, isThemeDark, resolveThemeColors } from './themeResolver';

describe('themeResolver', () => {
  it('keeps custom theme defaults independent from light theme defaults', () => {
    const colors = resolveThemeColors('custom', {}, {}, {});

    expect(colors.bgPrimary).toBe(defaultCustomColors.bgPrimary);
    expect(colors.bgPrimary).not.toBe(defaultLightColors.bgPrimary);
  });

  it('detects custom theme darkness from the resolved background color', () => {
    expect(isThemeDark('custom', { ...defaultCustomColors, bgPrimary: '#ffffff' })).toBe(false);
    expect(isThemeDark('custom', { ...defaultCustomColors, bgPrimary: '#0d1117' })).toBe(true);
  });

  it('allows custom syntax highlighting to override automatic darkness', () => {
    const lightCustom = { ...defaultCustomColors, bgPrimary: '#ffffff' };
    const darkCustom = { ...defaultCustomColors, bgPrimary: '#0d1117' };

    expect(isSyntaxHighlightDark('custom', lightCustom, 'auto')).toBe(false);
    expect(isSyntaxHighlightDark('custom', lightCustom, 'dark')).toBe(true);
    expect(isSyntaxHighlightDark('custom', darkCustom, 'light')).toBe(false);
  });
});
