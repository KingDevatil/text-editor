import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { shouldSuppressEvent } = require('./watcher.cjs');

describe('watcher event deduplication', () => {
  it('suppresses only repeated events of the same kind', () => {
    const last = { kind: 'change', time: 1000 };
    expect(shouldSuppressEvent(last, 'change', 1200)).toBe(true);
    expect(shouldSuppressEvent(last, 'unlink', 1200)).toBe(false);
  });

  it('allows the same event after the deduplication window', () => {
    expect(shouldSuppressEvent({ kind: 'unlink', time: 1000 }, 'unlink', 1500)).toBe(false);
  });
});
