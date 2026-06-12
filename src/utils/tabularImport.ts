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
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed.map((item) => coerceValueLike(item, typeHint[0]));

  const separator = value.includes(';') ? ';' : value.includes(',') ? ',' : null;
  if (!separator) return parseCellValueByFallback(value);

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

function coerceValueLike(value: unknown, typeHint: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (typeHint === undefined) return parseCellValueByFallback(value);
  return parseCellValueLike(value, typeHint);
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
