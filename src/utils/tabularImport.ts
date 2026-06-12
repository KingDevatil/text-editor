export interface TabularImportResult {
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface TabularImportOptions {
  fieldTypeHints?: Record<string, unknown>;
}

export function parseTabDelimitedObjects(
  input: string,
  options: TabularImportOptions = {}
): TabularImportResult {
  const lines = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('导入文件至少需要 1 行字段名和 1 行数据');
  }

  const headers = lines[0].split('\t').map((header) => header.trim());
  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new Error('字段名不能为空');
  }

  const duplicateHeader = headers.find((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeader) {
    throw new Error(`字段名 "${duplicateHeader}" 重复`);
  }

  const rows = lines.slice(1).map((line) => {
    const cells = line.split('\t');
    return Object.fromEntries(
      headers.map((header, index) => [
        header,
        parseCellValue(cells[index] ?? '', options.fieldTypeHints?.[header]),
      ])
    );
  });

  return { headers, rows };
}

function parseCellValue(value: string, typeHint?: unknown): unknown {
  if (typeHint !== undefined) {
    return parseCellValueLike(value, typeHint);
  }
  return parseCellValueByFallback(value);
}

function parseCellValueLike(value: string, typeHint: unknown): unknown {
  const trimmed = value.trim();
  if (Array.isArray(typeHint)) return parseArrayCellValue(value, typeHint);
  if (typeHint === null) return /^null$/i.test(trimmed) || trimmed === '' ? null : parseCellValueByFallback(value);
  if (typeof typeHint === 'number') return parseNumberCellValue(value);
  if (typeof typeHint === 'boolean') return parseBooleanCellValue(value);
  if (typeof typeHint === 'string') return value;
  if (typeof typeHint === 'object') return parseObjectCellValue(value);
  return parseCellValueByFallback(value);
}

function parseCellValueByFallback(value: string): unknown {
  const trimmed = value.trim();
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^null$/i.test(trimmed)) return null;
  return value;
}

function parseNumberCellValue(value: string): unknown {
  const trimmed = value.trim();
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)
    ? Number(trimmed)
    : parseCellValueByFallback(value);
}

function parseBooleanCellValue(value: string): unknown {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'true' || trimmed === '1') return true;
  if (trimmed === 'false' || trimmed === '0') return false;
  return parseCellValueByFallback(value);
}

function parseArrayCellValue(value: string, typeHint: unknown[]): unknown {
  if (value.trim() === '') return [];

  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed.map((item) => coerceValueLike(item, typeHint[0]));

  const objectItems = parseDelimitedObjectArrayCellValue(value, typeHint[0]);
  if (objectItems) return objectItems;

  const separator = value.includes(';') ? ';' : value.includes(',') ? ',' : null;
  if (!separator) return [coerceValueLike(value, typeHint[0])];

  return value
    .split(separator)
    .map((item) => coerceValueLike(item, typeHint[0]));
}

function parseObjectCellValue(value: string): unknown {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed
    : parseCellValueByFallback(value);
}

function parseDelimitedObjectArrayCellValue(value: string, itemHint: unknown): unknown[] | null {
  if (!isPlainObject(itemHint)) return null;

  const fields = Object.keys(itemHint);
  if (fields.length === 0) return null;

  const groups = splitObjectArrayGroups(value, fields.length);
  if (!groups) return null;

  const itemHints = itemHint as Record<string, unknown>;
  return groups.map((group) => Object.fromEntries(
    fields.map((field, index) => [
      field,
      coerceValueLike(group[index] ?? '', itemHints[field]),
    ])
  ));
}

function splitObjectArrayGroups(value: string, fieldCount: number): string[][] | null {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const explicitGroupSeparator = ['|', '\n'].find((separator) => trimmed.includes(separator));
  if (explicitGroupSeparator) {
    const groups = splitNonEmpty(trimmed, explicitGroupSeparator);
    const fieldSeparator = chooseBestFieldSeparator(groups, fieldCount);
    return fieldSeparator
      ? groups.map((group) => splitObjectFields(group, fieldSeparator, fieldCount))
      : null;
  }

  const mixedSeparators = [',', ';'].filter((separator) => trimmed.includes(separator));
  if (mixedSeparators.length >= 2) {
    const groupSeparator = chooseBestGroupSeparator(trimmed, fieldCount, mixedSeparators);
    const fieldSeparator = mixedSeparators.find((separator) => separator !== groupSeparator);
    if (groupSeparator && fieldSeparator) {
      return splitNonEmpty(trimmed, groupSeparator)
        .map((group) => splitObjectFields(group, fieldSeparator, fieldCount));
    }
  }

  for (const fieldSeparator of [',', ';']) {
    if (!trimmed.includes(fieldSeparator)) continue;
    const fields = splitObjectFields(trimmed, fieldSeparator, fieldCount);
    if (fields.length === fieldCount) return [fields];
  }

  return null;
}

function chooseBestFieldSeparator(groups: string[], fieldCount: number): string | null {
  let best: { separator: string; score: number } | null = null;
  for (const separator of [',', ';', '\t']) {
    const score = groups.filter((group) => splitObjectFields(group, separator, fieldCount).length === fieldCount).length;
    if (!best || score > best.score) best = { separator, score };
  }
  return best && best.score > 0 ? best.separator : null;
}

function chooseBestGroupSeparator(value: string, fieldCount: number, separators: string[]): string | null {
  let best: { separator: string; score: number } | null = null;
  for (const separator of separators) {
    const groups = splitNonEmpty(value, separator);
    if (groups.length <= 1) continue;
    const fieldSeparator = separators.find((candidate) => candidate !== separator);
    if (!fieldSeparator) continue;
    const score = groups.filter((group) => splitObjectFields(group, fieldSeparator, fieldCount).length === fieldCount).length;
    if (!best || score > best.score) best = { separator, score };
  }
  return best && best.score > 0 ? best.separator : null;
}

function splitObjectFields(value: string, separator: string, fieldCount: number): string[] {
  const parts = splitNonEmpty(value, separator);
  if (parts.length <= fieldCount) return parts;
  return [
    ...parts.slice(0, fieldCount - 1),
    parts.slice(fieldCount - 1).join(separator),
  ];
}

function splitNonEmpty(value: string, separator: string): string[] {
  return value
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function coerceValueLike(value: unknown, typeHint: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (typeHint === undefined) return parseCellValueByFallback(value);
  return parseCellValueLike(value, typeHint);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
