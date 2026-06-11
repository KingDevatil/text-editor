import { describe, expect, it } from 'vitest';
import { parseJsonc } from './jsoncParser';
import { analyzeJsonForm } from './jsonFormAnalysis';

describe('jsonFormAnalysis', () => {
  it('warns when a homogeneous object array has a missing common field', () => {
    const { root } = parseJsonc(`{
      "items": [
        { "id": "a", "label": "A", "weight": 1 },
        { "id": "b", "label": "B" },
        { "id": "c", "label": "C", "weight": 3 }
      ]
    }`);

    expect(analyzeJsonForm(root)).toContainEqual(expect.objectContaining({
      severity: 'warning',
      path: ['items', 1],
      message: '同类数组元素缺少字段 "weight"',
    }));
  });

  it('reports duplicate identity values in sibling object arrays', () => {
    const { root } = parseJsonc(`{
      "records": [
        { "code": "same", "value": 1 },
        { "code": "same", "value": 2 }
      ]
    }`);

    expect(analyzeJsonForm(root)).toContainEqual(expect.objectContaining({
      severity: 'error',
      path: ['records', 1, 'code'],
      message: '字段 "code" 的值 "same" 在同一数组内重复',
    }));
  });

  it('does not analyze mixed arrays as homogeneous config rows', () => {
    const { root } = parseJsonc(`{
      "mixed": [
        { "id": "a" },
        "free text",
        { "id": "a" }
      ]
    }`);

    expect(analyzeJsonForm(root)).toEqual([]);
  });
});
