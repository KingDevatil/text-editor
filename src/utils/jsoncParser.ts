import * as jsonc from 'jsonc-parser';
import type { JSONPath } from 'jsonc-parser';

export type { JSONPath };

export interface JsonNodeInfo {
  path: JSONPath;
  key: string | number | undefined;
  value: unknown;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  children: JsonNodeInfo[];
  offset: number;
  length: number;
}

export interface ParsedJson {
  root: JsonNodeInfo | null;
  errors: jsonc.ParseError[];
  text: string;
}

export function parseJsonc(text: string): ParsedJson {
  const errors: jsonc.ParseError[] = [];
  const node = jsonc.parseTree(text, errors);
  if (!node) return { root: null, errors, text };
  return { root: buildNodeInfo(node, text, []), errors, text };
}

function buildNodeInfo(node: jsonc.Node, text: string, path: JSONPath): JsonNodeInfo {
  const type = mapNodeType(node.type);
  const info: JsonNodeInfo = {
    path: [...path],
    key: path.length > 0 ? path[path.length - 1] : undefined,
    value: type === 'object' || type === 'array' ? undefined : extractValue(node, text),
    type,
    children: [],
    offset: node.offset,
    length: node.length,
  };

  if (node.type === 'object' && node.children) {
    for (const propNode of node.children) {
      if (propNode.type !== 'property' || !propNode.children || propNode.children.length < 2) continue;
      const keyNode = propNode.children[0];
      const valNode = propNode.children[1];
      const key = extractValue(keyNode, text) as string;
      info.children.push(buildNodeInfo(valNode, text, [...path, key]));
    }
  } else if (node.type === 'array' && node.children) {
    info.children = node.children.map((child, idx) =>
      buildNodeInfo(child, text, [...path, idx])
    );
  }

  return info;
}

function mapNodeType(type: string): JsonNodeInfo['type'] {
  switch (type) {
    case 'object': return 'object';
    case 'array': return 'array';
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    default: return 'null';
  }
}

function extractValue(node: jsonc.Node, text: string): unknown {
  const raw = text.substring(node.offset, node.offset + node.length);
  switch (node.type) {
    case 'string': return raw.slice(1, -1);
    case 'number': return Number(raw);
    case 'boolean': return raw === 'true';
    case 'null': return null;
    default: return undefined;
  }
}

export function applyValueEdit(
  text: string,
  path: JSONPath,
  newValue: unknown
): string {
  const edits = jsonc.modify(text, path, newValue, {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
  return jsonc.applyEdits(text, edits);
}

export function copyNode(
  text: string,
  parentPath: JSONPath,
  sourceKey: string | number,
  isObject: boolean
): { newText: string; newPath: JSONPath } {
  const sourcePath = [...parentPath, sourceKey];
  const tree = jsonc.parseTree(text);
  if (!tree) return { newText: text, newPath: sourcePath };

  const sourceNode = jsonc.findNodeAtLocation(tree, sourcePath);
  if (!sourceNode) return { newText: text, newPath: sourcePath };

  const rawValue = text.substring(sourceNode.offset, sourceNode.offset + sourceNode.length);
  let sourceValue: unknown;
  try {
    sourceValue = jsonc.parse(rawValue);
  } catch {
    return { newText: text, newPath: sourcePath };
  }

  if (isObject && typeof sourceKey === 'string') {
    const existingKeys = getSiblingKeys(tree, text, parentPath);
    const newKey = generateUniqueKey(sourceKey, existingKeys);
    const edits = jsonc.modify(text, [...parentPath, newKey], sourceValue, {
      formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
    });
    return { newText: jsonc.applyEdits(text, edits), newPath: [...parentPath, newKey] };
  }

  const parentArr = jsonc.findNodeAtLocation(tree, parentPath);
  const idx = parentArr?.children?.length ?? 0;
  const edits = jsonc.modify(text, [...parentPath, idx], sourceValue, {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
  return { newText: jsonc.applyEdits(text, edits), newPath: [...parentPath, idx] };
}

export function addField(
  text: string,
  parentPath: JSONPath,
  isObject: boolean,
  key?: string,
  value?: unknown
): { newText: string; newPath: JSONPath } {
  const tree = jsonc.parseTree(text);
  if (!tree) return { newText: text, newPath: parentPath };

  if (isObject) {
    const existingKeys = getSiblingKeys(tree, text, parentPath);
    const newKey = key || generateUniqueKey('newField', existingKeys);
    const edits = jsonc.modify(text, [...parentPath, newKey], value ?? '', {
      formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
    });
    return { newText: jsonc.applyEdits(text, edits), newPath: [...parentPath, newKey] };
  }

  const parentArr = jsonc.findNodeAtLocation(tree, parentPath);
  const idx = parentArr?.children?.length ?? 0;
  const edits = jsonc.modify(text, [...parentPath, idx], value ?? '', {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
  return { newText: jsonc.applyEdits(text, edits), newPath: [...parentPath, idx] };
}

export function removeField(text: string, path: JSONPath): string {
  const edits = jsonc.modify(text, path, undefined, {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
  return jsonc.applyEdits(text, edits);
}

export function isSimpleArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean' ||
      item === null
  );
}

function getSiblingKeys(tree: jsonc.Node, text: string, parentPath: JSONPath): string[] {
  const parent = jsonc.findNodeAtLocation(tree, parentPath);
  if (!parent || parent.type !== 'object' || !parent.children) return [];
  const keys: string[] = [];
  for (const propNode of parent.children) {
    if (propNode.type === 'property' && propNode.children && propNode.children.length >= 1) {
      const keyNode = propNode.children[0];
      const raw = text.substring(keyNode.offset, keyNode.offset + keyNode.length);
      keys.push(raw.slice(1, -1));
    }
  }
  return keys;
}

function generateUniqueKey(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let counter = 2;
  while (existing.includes(`${base}_${counter}`)) counter++;
  return `${base}_${counter}`;
}

function detectEol(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}
