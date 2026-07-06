import { describe, expect, it } from 'vitest';
import { defaultCustomColors, defaultLightColors } from './themeDefaults';
import { isThemeDark, resolveThemeColors } from './themeResolver';

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
});
