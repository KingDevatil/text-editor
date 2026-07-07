import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { injectThemeVars, applySavedTheme } from './themeInjector';
import { defaultDarkColors, defaultLightColors } from './themeDefaults';

describe('themeInjector', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    localStorage.clear();
  });

  afterEach(() => {
    const style = document.getElementById('te-theme-vars');
    if (style) style.remove();
    localStorage.clear();
  });

  it('injects a style element with CSS variables', () => {
    injectThemeVars(defaultDarkColors);
    const style = document.getElementById('te-theme-vars') as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('--te-bg-primary: #0d1117');
    expect(style!.textContent).toContain('--te-editor-cursor: #d4d4d4');
    expect(style!.textContent).toContain('--te-toolbar-button-text: #e5e7eb');
    expect(style!.textContent).toContain('--te-tab-inactive-bg: #1f2937');
  });

  it('updates existing style element on re-inject', () => {
    injectThemeVars(defaultDarkColors);
    injectThemeVars(defaultLightColors);
    const styles = document.querySelectorAll('#te-theme-vars');
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toContain('--te-bg-primary: #ffffff');
  });

  it('applySavedTheme falls back to dark theme when localStorage is empty', () => {
    applySavedTheme();
    const style = document.getElementById('te-theme-vars') as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('--te-bg-primary: #0d1117');
  });

  it('applySavedTheme reads te2-prefs and applies light theme', () => {
    localStorage.setItem('te2-prefs', JSON.stringify({ theme: 'light' }));
    applySavedTheme();
    const style = document.getElementById('te-theme-vars') as HTMLStyleElement | null;
    expect(style!.textContent).toContain('--te-bg-primary: #ffffff');
  });

  it('applySavedTheme reads te2-settings fallback key', () => {
    localStorage.setItem('te2-settings', JSON.stringify({ theme: 'custom', customColors: { bgPrimary: '#123456' } }));
    applySavedTheme();
    const style = document.getElementById('te-theme-vars') as HTMLStyleElement | null;
    expect(style!.textContent).toContain('--te-bg-primary: #123456');
  });

  it('applySavedTheme handles malformed JSON gracefully', () => {
    localStorage.setItem('te2-prefs', 'not-json');
    expect(() => applySavedTheme()).not.toThrow();
    const style = document.getElementById('te-theme-vars') as HTMLStyleElement | null;
    expect(style).not.toBeNull();
  });

  it('dispatches te-theme-change event on inject', () => {
    const listener = vi.fn();
    window.addEventListener('te-theme-change', listener);
    injectThemeVars(defaultDarkColors);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('te-theme-change', listener);
  });
});
