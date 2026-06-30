import { describe, expect, it } from 'vitest';
import { parseDelimitedChildValues, parseTabDelimitedObjects } from './tabularImport';

describe('parseTabDelimitedObjects', () => {
  it('parses tab-delimited rows with a header line', () => {
    const result = parseTabDelimitedObjects([
      'ID\tStartTime\tEndTime\tDesc\tExchangeItem',
      '1112\t2026:04:14-00:00:00\t2026:05:31-23:59:59\tRecruit heroes\t6;100',
    ].join('\n'));

    expect(result.headers).toEqual(['ID', 'StartTime', 'EndTime', 'Desc', 'ExchangeItem']);
    expect(result.rows).toEqual([
      {
        ID: 1112,
        StartTime: '2026:04:14-00:00:00',
        EndTime: '2026:05:31-23:59:59',
        Desc: 'Recruit heroes',
        ExchangeItem: '6;100',
      },
    ]);
  });

  it('rejects duplicate headers', () => {
    expect(() => parseTabDelimitedObjects('ID\tID\n1\t2')).toThrow('ID');
  });

  it('uses field type hints before fallback parsing', () => {
    const result = parseTabDelimitedObjects('ID\tName\tEnabled\tMissing\n1001\t42\t1\t100', {
      fieldTypeHints: {
        ID: '',
        Name: '',
        Enabled: false,
      },
    });

    expect(result.rows[0]).toEqual({
      ID: '1001',
      Name: '42',
      Enabled: true,
      Missing: 100,
    });
  });

  it('uses array field hints for delimited cells', () => {
    const result = parseTabDelimitedObjects('ID\tExchangeItem\n1001\t6;100', {
      fieldTypeHints: {
        ID: 0,
        ExchangeItem: [0],
      },
    });

    expect(result.rows[0]).toEqual({
      ID: 1001,
      ExchangeItem: [6, 100],
    });
  });

  it('keeps array field hints as arrays for single and blank cells', () => {
    const result = parseTabDelimitedObjects('ID\tExchangeItem\n1001\t6\n1002\t', {
      fieldTypeHints: {
        ID: 0,
        ExchangeItem: [0],
      },
    });

    expect(result.rows).toEqual([
      {
        ID: 1001,
        ExchangeItem: [6],
      },
      {
        ID: 1002,
        ExchangeItem: [],
      },
    ]);
  });

  it('fills array object fields from delimited values using the existing item template', () => {
    const result = parseTabDelimitedObjects([
      'ID\tExchangeItem',
      '1112\t6,100;7,100',
      '1113\t6;100|7;100',
      '1114\t6,100;7,100',
      '1115\t6,100|7,100',
    ].join('\n'), {
      fieldTypeHints: {
        ID: 0,
        ExchangeItem: [{ itemid: 0, count: 0 }],
      },
    });

    expect(result.rows).toEqual([
      {
        ID: 1112,
        ExchangeItem: [
          { itemid: 6, count: 100 },
          { itemid: 7, count: 100 },
        ],
      },
      {
        ID: 1113,
        ExchangeItem: [
          { itemid: 6, count: 100 },
          { itemid: 7, count: 100 },
        ],
      },
      {
        ID: 1114,
        ExchangeItem: [
          { itemid: 6, count: 100 },
          { itemid: 7, count: 100 },
        ],
      },
      {
        ID: 1115,
        ExchangeItem: [
          { itemid: 6, count: 100 },
          { itemid: 7, count: 100 },
        ],
      },
    ]);
  });

  it('uses an object array template for a single item with delimited fields', () => {
    const result = parseTabDelimitedObjects('ID\tExchangeItem\n1112\t6;100', {
      fieldTypeHints: {
        ID: 0,
        ExchangeItem: [{ itemid: 0, count: 0 }],
      },
    });

    expect(result.rows[0]).toEqual({
      ID: 1112,
      ExchangeItem: [{ itemid: 6, count: 100 }],
    });
  });

  it('fills object fields from delimited values using the existing object template', () => {
    const result = parseTabDelimitedObjects('ItemId\tRequirement\n1\t1,0', {
      fieldTypeHints: {
        ItemId: 0,
        Requirement: { StoreLevel: 0, SeasonLevel: 0 },
      },
    });

    expect(result.rows[0]).toEqual({
      ItemId: 1,
      Requirement: {
        StoreLevel: 1,
        SeasonLevel: 0,
      },
    });
  });

  it('imports store rows with object arrays and nested object fields from compact cells', () => {
    const result = parseTabDelimitedObjects([
      'ItemId\tDesc\tItemCount\tMaxBuyCount\tCostItems\tDiscount\tRequirement',
      '1\tRefine stone\t500\t100\t262,200\t0\t1,0',
    ].join('\n'), {
      fieldTypeHints: {
        ItemId: 0,
        Desc: '',
        ItemCount: 0,
        MaxBuyCount: 0,
        CostItems: [{ ItemId: 0, Count: 0 }],
        Discount: 0,
        Requirement: { StoreLevel: 0, SeasonLevel: 0 },
      },
    });

    expect(result.rows[0]).toEqual({
      ItemId: 1,
      Desc: 'Refine stone',
      ItemCount: 500,
      MaxBuyCount: 100,
      CostItems: [{ ItemId: 262, Count: 200 }],
      Discount: 0,
      Requirement: {
        StoreLevel: 1,
        SeasonLevel: 0,
      },
    });
  });

  it('accepts alternate delimiters for object template fields', () => {
    const result = parseTabDelimitedObjects([
      'ID\tComma\tAmpersand\tSemicolon\tPipe',
      '1\t1,0\t2&0\t3;0\t4|0',
    ].join('\n'), {
      fieldTypeHints: {
        ID: 0,
        Comma: { StoreLevel: 0, SeasonLevel: 0 },
        Ampersand: { StoreLevel: 0, SeasonLevel: 0 },
        Semicolon: { StoreLevel: 0, SeasonLevel: 0 },
        Pipe: { StoreLevel: 0, SeasonLevel: 0 },
      },
    });

    expect(result.rows[0]).toEqual({
      ID: 1,
      Comma: { StoreLevel: 1, SeasonLevel: 0 },
      Ampersand: { StoreLevel: 2, SeasonLevel: 0 },
      Semicolon: { StoreLevel: 3, SeasonLevel: 0 },
      Pipe: { StoreLevel: 4, SeasonLevel: 0 },
    });
  });

  it('uses delimiter hierarchy for nested array templates', () => {
    const result = parseTabDelimitedObjects('ID\tRewards\n1\t1,2;1,3|1,2;1,3|1,2;1,3', {
      fieldTypeHints: {
        ID: 0,
        Rewards: [[{ ItemId: 0, Count: 0 }]],
      },
    });

    expect(result.rows[0]).toEqual({
      ID: 1,
      Rewards: [
        [
          { ItemId: 1, Count: 2 },
          { ItemId: 1, Count: 3 },
        ],
        [
          { ItemId: 1, Count: 2 },
          { ItemId: 1, Count: 3 },
        ],
        [
          { ItemId: 1, Count: 2 },
          { ItemId: 1, Count: 3 },
        ],
      ],
    });
  });

  it('infers delimiter hierarchy from the template shape instead of fixed characters', () => {
    const result = parseTabDelimitedObjects('ID\tRewards\n1\t1&2|1&3;1&2|1&3;1&2|1&3', {
      fieldTypeHints: {
        ID: 0,
        Rewards: [[{ ItemId: 0, Count: 0 }]],
      },
    });

    expect(result.rows[0]).toEqual({
      ID: 1,
      Rewards: [
        [
          { ItemId: 1, Count: 2 },
          { ItemId: 1, Count: 3 },
        ],
        [
          { ItemId: 1, Count: 2 },
          { ItemId: 1, Count: 3 },
        ],
        [
          { ItemId: 1, Count: 2 },
          { ItemId: 1, Count: 3 },
        ],
      ],
    });
  });
});

describe('parseDelimitedChildValues', () => {
  it('parses delimited text into sibling values using the selected child as template', () => {
    expect(parseDelimitedChildValues('6,100;7,200', { itemid: 0, count: 0 })).toEqual([
      { itemid: 6, count: 100 },
      { itemid: 7, count: 200 },
    ]);
  });

  it('keeps nested array structure when the selected child is an array template', () => {
    expect(parseDelimitedChildValues('1&2|1&3;4&5|4&6', [{ ItemId: 0, Count: 0 }])).toEqual([
      [
        { ItemId: 1, Count: 2 },
        { ItemId: 1, Count: 3 },
      ],
      [
        { ItemId: 4, Count: 5 },
        { ItemId: 4, Count: 6 },
      ],
    ]);
  });
});
