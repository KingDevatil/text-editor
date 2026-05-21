import { describe, it, expect } from 'vitest';
import { normalizePath } from './useFileOpener';

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\foo\\bar.txt')).toBe('c:/users/foo/bar.txt');
    expect(normalizePath('src\\hooks\\useFile.ts')).toBe('src/hooks/usefile.ts');
  });

  it('lowercases the entire path', () => {
    expect(normalizePath('C:/Users/Foo/BAR.TXT')).toBe('c:/users/foo/bar.txt');
    expect(normalizePath('SRC/Main.tsx')).toBe('src/main.tsx');
  });

  it('handles mixed separators and casing', () => {
    expect(normalizePath('C:\\Projects/MyApp\\src/App.tsx')).toBe('c:/projects/myapp/src/app.tsx');
  });

  it('leaves empty string unchanged', () => {
    expect(normalizePath('')).toBe('');
  });

  it('handles forward-only paths', () => {
    expect(normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt');
  });
});
