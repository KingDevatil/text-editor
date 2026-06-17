import { describe, expect, it } from 'vitest';
import { prepareHtmlSrcDoc } from './htmlPreview';

describe('prepareHtmlSrcDoc', () => {
  it('wraps HTML fragments in a complete document', () => {
    const srcDoc = prepareHtmlSrcDoc('<h1>HTML LOAD OK</h1>', false);
    const doc = parse(srcDoc);

    expect(doc.doctype?.name).toBe('html');
    expect(doc.querySelector('h1')?.textContent).toBe('HTML LOAD OK');
    expect(doc.querySelector('style[data-te-preview-artifact]')).not.toBeNull();
    expect(doc.querySelector('script[data-te-preview-artifact]')).not.toBeNull();
    expect(srcDoc).toContain('scrollbar-width: none');
  });

  it('injects preview artifacts into an existing head', () => {
    const srcDoc = prepareHtmlSrcDoc('<!DOCTYPE html><html lang="zh"><head><title>T</title></head><body><h1>OK</h1></body></html>', false);
    const doc = parse(srcDoc);

    expect(doc.documentElement.lang).toBe('zh');
    expect(doc.querySelector('head title')?.textContent).toBe('T');
    expect(doc.querySelector('head style[data-te-preview-artifact]')).not.toBeNull();
    expect(doc.querySelector('body h1')?.textContent).toBe('OK');
  });

  it('does not inject editor theme colors or typography into HTML pages', () => {
    const srcDoc = prepareHtmlSrcDoc('<!DOCTYPE html><html><head></head><body><h1>Original</h1></body></html>', true);

    expect(srcDoc).not.toContain('background-color:');
    expect(srcDoc).not.toContain('color:');
    expect(srcDoc).not.toContain('font-family:');
    expect(srcDoc).not.toContain('line-height:');
  });

  it('adds a head without dropping html attributes', () => {
    const srcDoc = prepareHtmlSrcDoc('<!DOCTYPE html><html lang="zh-CN"><body><h1>OK</h1></body></html>', false);
    const doc = parse(srcDoc);

    expect(doc.documentElement.lang).toBe('zh-CN');
    expect(doc.querySelector('head style[data-te-preview-artifact]')).not.toBeNull();
    expect(doc.querySelector('body h1')?.textContent).toBe('OK');
  });

  it('wraps doctype-only documents without nesting a doctype inside html', () => {
    const srcDoc = prepareHtmlSrcDoc('<!DOCTYPE html><h1>DOCTYPE ONLY</h1>', false);
    const doc = parse(srcDoc);

    expect(srcDoc.match(/<!DOCTYPE/gi)).toHaveLength(1);
    expect(doc.doctype?.name).toBe('html');
    expect(doc.querySelector('body h1')?.textContent).toBe('DOCTYPE ONLY');
    expect(doc.querySelector('head style[data-te-preview-artifact]')).not.toBeNull();
  });
});

function parse(srcDoc: string): Document {
  return new DOMParser().parseFromString(srcDoc, 'text/html');
}
