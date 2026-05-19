import { describe, it, expect } from 'vitest';
import { detectLineEnding } from './lineEnding';

describe('detectLineEnding', () => {
  it('detects LF-only files', () => {
    expect(detectLineEnding('line1\nline2\nline3')).toBe('LF');
  });

  it('detects CRLF-only files', () => {
    expect(detectLineEnding('line1\r\nline2\r\nline3')).toBe('CRLF');
  });

  it('detects CR-only files', () => {
    expect(detectLineEnding('line1\rline2\rline3')).toBe('CR');
  });

  it('detects Mixed when LF and CRLF coexist', () => {
    expect(detectLineEnding('line1\nline2\r\nline3')).toBe('Mixed');
  });

  it('detects Mixed when CR and CRLF coexist', () => {
    expect(detectLineEnding('line1\rline2\r\nline3')).toBe('Mixed');
  });

  it('detects Mixed when LF and CR coexist', () => {
    expect(detectLineEnding('line1\nline2\rline3')).toBe('Mixed');
  });

  it('defaults to LF for empty string', () => {
    expect(detectLineEnding('')).toBe('LF');
  });

  it('defaults to LF for single line without breaks', () => {
    expect(detectLineEnding('just one line')).toBe('LF');
  });

  it('scans full text when sample is ambiguous due to split CRLF at boundary', () => {
    // Create a text where \r\n is split at the 8KB sample boundary:
    // positions 0-8190 = 'a', position 8191 = '\r', position 8192 = '\n'.
    // The sample (first 8192 chars) ends with '\r' which looks like a lone CR.
    const prefix = 'a'.repeat(8191);
    const text = prefix + '\r\n';
    expect(text.length).toBeGreaterThan(8192);
    // Sample says CR, full scan reveals CRLF
    expect(detectLineEnding(text)).toBe('CRLF');
  });

  it('uses sample when sample is unambiguous', () => {
    // Create a large string that is uniformly CRLF
    const text = 'a\r\n'.repeat(10000);
    expect(text.length).toBeGreaterThan(8192);
    expect(detectLineEnding(text)).toBe('CRLF');
  });

  it('returns LF for large file with no line endings', () => {
    const text = 'a'.repeat(10000);
    expect(detectLineEnding(text)).toBe('LF');
  });
});
