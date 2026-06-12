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

    const issue = analyzeJsonForm(root).find((candidate) =>
      candidate.severity === 'warning' &&
      candidate.path.join('.') === 'items.1'
    );

    expect(issue?.message).toContain('"weight"');
  });

  it('reports duplicate identity values in sibling object arrays', () => {
    const { root } = parseJsonc(`{
      "records": [
        { "code": "same", "value": 1 },
        { "code": "same", "value": 2 }
      ]
    }`);

    const issue = analyzeJsonForm(root).find((candidate) =>
      candidate.severity === 'error' &&
      candidate.path.join('.') === 'records.1.code'
    );

    expect(issue?.message).toContain('"code"');
    expect(issue?.message).toContain('"same"');
  });

  it('reports duplicate values for the first field in object arrays', () => {
    const { root } = parseJsonc(`{
      "records": [
        { "type": "same", "value": 1 },
        { "type": "same", "value": 2 }
      ]
    }`);

    const issue = analyzeJsonForm(root).find((candidate) =>
      candidate.severity === 'error' &&
      candidate.path.join('.') === 'records.1.type'
    );

    expect(issue?.message).toContain('"type"');
    expect(issue?.message).toContain('"same"');
  });

  it('reports duplicate values for the first field in object child collections', () => {
    const { root } = parseJsonc(`{
      "records": {
        "row_a": { "type": "same", "value": 1 },
        "row_b": { "type": "same", "value": 2 }
      }
    }`);

    const issue = analyzeJsonForm(root).find((candidate) =>
      candidate.severity === 'error' &&
      candidate.path.join('.') === 'records.row_b.type'
    );

    expect(issue?.message).toContain('"type"');
    expect(issue?.message).toContain('"same"');
  });

  it('warns when a homogeneous object child collection has a missing common field', () => {
    const { root } = parseJsonc(`{
      "records": {
        "row_a": { "id": "a", "label": "A", "weight": 1 },
        "row_b": { "id": "b", "label": "B" },
        "row_c": { "id": "c", "label": "C", "weight": 3 }
      }
    }`);

    const issue = analyzeJsonForm(root).find((candidate) =>
      candidate.severity === 'warning' &&
      candidate.path.join('.') === 'records.row_b'
    );

    expect(issue?.message).toContain('"weight"');
  });

  it('does not report duplicate first-field identity keys twice', () => {
    const { root } = parseJsonc(`{
      "records": [
        { "code": "same", "value": 1 },
        { "code": "same", "value": 2 }
      ]
    }`);

    const duplicateCodeIssues = analyzeJsonForm(root).filter((issue) =>
      issue.severity === 'error' &&
      issue.path.join('.') === 'records.1.code'
    );

    expect(duplicateCodeIssues).toHaveLength(1);
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
