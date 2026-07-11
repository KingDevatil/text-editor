import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { isAllowedRendererUrl } = require('./ipcSecurity.cjs');

describe('isAllowedRendererUrl', () => {
  it('allows only the configured development origin', () => {
    const options = {
      isDev: true,
      devServerUrl: 'http://localhost:1420',
      entryFile: '',
    };
    expect(isAllowedRendererUrl('http://localhost:1420/index.html', options)).toBe(true);
    expect(isAllowedRendererUrl('http://localhost:3000/index.html', options)).toBe(false);
    expect(isAllowedRendererUrl('https://example.com', options)).toBe(false);
  });

  it('allows only the packaged entry file in production', () => {
    const entryFile = path.resolve('dist/index.html');
    const options = { isDev: false, devServerUrl: '', entryFile };
    expect(isAllowedRendererUrl(pathToFileURL(entryFile).href, options)).toBe(true);
    expect(isAllowedRendererUrl(pathToFileURL(path.resolve('dist/other.html')).href, options)).toBe(false);
    expect(isAllowedRendererUrl('https://example.com', options)).toBe(false);
  });
});
