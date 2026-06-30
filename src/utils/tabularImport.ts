export interface TabularImportResult {
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface TabularImportOptions {
  fieldTypeHints?: Record<string, unknown>;
}

const DELIMITERS = [',', '&', ';', '|', '\n'] as const;

interface TemplateParseMatch {
  value: unknown;
  score: number;
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

export function parseDelimitedChildValues(input: string, childTemplate: unknown): unknown[] {
  if (input.trim() === '') return [];
  const parsed = parseArrayCellValue(input, [childTemplate]);
  return Array.isArray(parsed) ? parsed : [parsed];
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
  if (typeof typeHint === 'object') return parseObjectCellValue(value, typeHint);
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

  const itemHint = typeHint[0];
  if (!isPrimitiveHint(itemHint)) {
    const match = parseDelimitedArrayByTemplate(value, itemHint);
    if (match) return match.value;
  }

  if (isPrimitiveHint(itemHint)) {
    const primitiveParts = splitPrimitiveArrayValues(value);
    if (primitiveParts.length > 1) return primitiveParts.map((item) => coerceValueLike(item, itemHint));
  }

  return [coerceValueLike(value, itemHint)];
}

function parseObjectCellValue(value: string, typeHint: object): unknown {
  const parsed = parseJsonValue(value);
  if (isPlainObject(parsed)) return coerceObjectLike(parsed, typeHint);

  const match = parseDelimitedObjectByTemplate(value, typeHint);
  return match?.value ?? parseCellValueByFallback(value);
}

function parseDelimitedArrayByTemplate(value: string, itemHint: unknown): TemplateParseMatch | null {
  let best: TemplateParseMatch | null = null;

  for (const separator of getPresentDelimiters(value)) {
    const parts = splitNonEmpty(value, separator);
    if (parts.length <= 1) continue;

    const childMatches = parts.map((part) => parseTemplatePart(part, itemHint));
    if (childMatches.some((match) => !match)) continue;

    const matches = childMatches as TemplateParseMatch[];
    const score = 10 + parts.length + matches.reduce((sum, match) => sum + match.score, 0);
    const candidate = {
      value: matches.map((match) => match.value),
      score,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  if (!best && !isPrimitiveHint(itemHint)) {
    const childMatch = parseTemplatePart(value, itemHint);
    if (childMatch) {
      return {
        value: [childMatch.value],
        score: childMatch.score,
      };
    }
  }

  return best;
}

function parseDelimitedObjectByTemplate(value: string, typeHint: object): TemplateParseMatch | null {
  if (!isPlainObject(typeHint) || value.trim() === '') return null;

  const fields = Object.keys(typeHint);
  if (fields.length === 0) return null;

  let best: TemplateParseMatch | null = null;
  for (const separator of getPresentDelimiters(value)) {
    const values = splitObjectFields(value, separator, fields.length);
    if (values.length !== fields.length) continue;

    const childMatches = fields.map((field, index) => parseTemplatePart(values[index] ?? '', typeHint[field]));
    if (childMatches.some((match) => !match)) continue;

    const matches = childMatches as TemplateParseMatch[];
    const candidate = {
      value: Object.fromEntries(fields.map((field, index) => [field, matches[index].value])),
      score: 10 + matches.reduce((sum, match) => sum + match.score, 0),
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  return best;
}

function parseTemplatePart(value: string, typeHint: unknown): TemplateParseMatch | null {
  if (Array.isArray(typeHint)) return parseArrayTemplatePart(value, typeHint);
  if (isPlainObject(typeHint)) return parseDelimitedObjectByTemplate(value, typeHint);

  const parsedValue = coerceValueLike(value, typeHint);
  return isCompatibleWithPrimitiveHint(parsedValue, typeHint)
    ? { value: parsedValue, score: 0 }
    : null;
}

function parseArrayTemplatePart(value: string, typeHint: unknown[]): TemplateParseMatch | null {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) {
    return {
      value: parsed.map((item) => coerceValueLike(item, typeHint[0])),
      score: 10,
    };
  }

  if (isPrimitiveHint(typeHint[0])) {
    const parts = splitPrimitiveArrayValues(value);
    if (parts.length <= 1) return null;

    const matches = parts.map((part) => parseTemplatePart(part, typeHint[0]));
    if (matches.some((match) => !match)) return null;

    return {
      value: (matches as TemplateParseMatch[]).map((match) => match.value),
      score: 10 + parts.length,
    };
  }

  return parseDelimitedArrayByTemplate(value, typeHint[0]);
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

function splitPrimitiveArrayValues(value: string): string[] {
  return value
    .split(/[,&;|\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function getPresentDelimiters(value: string): string[] {
  return DELIMITERS.filter((separator) => value.includes(separator));
}

function isPrimitiveHint(typeHint: unknown): boolean {
  return !Array.isArray(typeHint) && !isPlainObject(typeHint);
}

function isCompatibleWithPrimitiveHint(value: unknown, typeHint: unknown): boolean {
  if (typeHint === undefined) return true;
  if (typeHint === null) return value === null;
  if (typeof typeHint === 'number') return typeof value === 'number';
  if (typeof typeHint === 'boolean') return typeof value === 'boolean';
  if (typeof typeHint === 'string') return typeof value === 'string';
  return true;
}

function coerceValueLike(value: unknown, typeHint: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (typeHint === undefined) return parseCellValueByFallback(value);
  return parseCellValueLike(value, typeHint);
}

function coerceObjectLike(value: Record<string, unknown>, typeHint: object): Record<string, unknown> {
  if (!isPlainObject(typeHint)) return value;

  const result = { ...value };
  for (const [field, hint] of Object.entries(typeHint)) {
    if (Object.prototype.hasOwnProperty.call(result, field)) {
      result[field] = coerceValueLike(result[field], hint);
    }
  }
  return result;
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
