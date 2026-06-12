import { describe, expect, it } from 'vitest';
import { parseTabDelimitedObjects } from './tabularImport';

describe('parseTabDelimitedObjects', () => {
  it('parses tab-delimited rows with a header line', () => {
    const result = parseTabDelimitedObjects([
      'ID\tStartTime\tEndTime\tDesc\tExchangeItem',
      '1112\t2026:04:14-00:00:00\t2026:05:31-23:59:59\t用于在点将台中招募武将\t6;100',
    ].join('\n'));

    expect(result.headers).toEqual(['ID', 'StartTime', 'EndTime', 'Desc', 'ExchangeItem']);
    expect(result.rows).toEqual([
      {
        ID: 1112,
        StartTime: '2026:04:14-00:00:00',
        EndTime: '2026:05:31-23:59:59',
        Desc: '用于在点将台中招募武将',
        ExchangeItem: '6;100',
      },
    ]);
  });

  it('rejects duplicate headers', () => {
    expect(() => parseTabDelimitedObjects('ID\tID\n1\t2')).toThrow('字段名 "ID" 重复');
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
});
