import { describe, expect, it } from 'vitest';
import { buildRegex, createCondition } from './regexBuilder';
import type { RegexCondition } from '../types';

describe('regexBuilder', () => {
  it('builds a hex digit preset', () => {
    const result = buildRegex([
      { id: 'hex', type: 'hexDigit', quantifier: 'one-or-more' },
    ]);

    expect(result).toEqual({ regex: '[0-9a-fA-F]+', isValid: true });
    expect(new RegExp(`^${result.regex}$`).test('0aF9')).toBe(true);
    expect(new RegExp(`^${result.regex}$`).test('0g')).toBe(false);
  });

  it('builds editable character ranges without escaping range hyphens', () => {
    const result = buildRegex([
      { id: 'range', type: 'charRange', value: '0-9a-fA-F', quantifier: 'exactly-n', quantifierValue: { n: 6 } },
    ]);

    expect(result).toEqual({ regex: '[0-9a-fA-F]{6}', isValid: true });
    expect(new RegExp(`^${result.regex}$`).test('A0b9fF')).toBe(true);
    expect(new RegExp(`^${result.regex}$`).test('A0b9fG')).toBe(false);
  });

  it('creates character range conditions with a useful default', () => {
    const condition = createCondition('charRange');

    expect(condition.value).toBe('0-9');
    expect(buildRegex([condition as RegexCondition]).regex).toBe('[0-9]');
  });
});
