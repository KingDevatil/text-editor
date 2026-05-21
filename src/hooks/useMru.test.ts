import { describe, it, expect, beforeEach } from 'vitest';
import { addToMru, removeFromMru, getMruItems } from './useMru';

const MRU_KEY = 'te2-mru';

describe('useMru', () => {
  beforeEach(() => {
    localStorage.removeItem(MRU_KEY);
  });

  it('adds items to the top', () => {
    addToMru('/a.ts', 'a.ts');
    addToMru('/b.ts', 'b.ts');
    const items = getMruItems();
    expect(items[0].path).toBe('/b.ts');
    expect(items[1].path).toBe('/a.ts');
  });

  it('deduplicates existing paths', () => {
    addToMru('/a.ts', 'a.ts');
    addToMru('/b.ts', 'b.ts');
    addToMru('/a.ts', 'a.ts');
    const items = getMruItems();
    expect(items).toHaveLength(2);
    expect(items[0].path).toBe('/a.ts');
  });

  it('caps at 50 items', () => {
    for (let i = 0; i < 55; i++) {
      addToMru(`/file-${i}.ts`, `file-${i}.ts`);
    }
    const items = getMruItems();
    expect(items).toHaveLength(50);
  });

  it('removes items by path', () => {
    addToMru('/a.ts', 'a.ts');
    addToMru('/b.ts', 'b.ts');
    removeFromMru('/a.ts');
    const items = getMruItems();
    expect(items).toHaveLength(1);
    expect(items[0].path).toBe('/b.ts');
  });
});
