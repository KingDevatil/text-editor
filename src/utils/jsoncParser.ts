import * as jsonc from 'jsonc-parser';
import type { JSONPath } from 'jsonc-parser';

export type { JSONPath };

export interface JsonTextEdit {
  offset: number;
  length: number;
  content: string;
}

export interface JsonNodeInfo {
  path: JSONPath;
  key: string | number | undefined;
  value: unknown;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  children: JsonNodeInfo[];
  offset: number;
  length: number;
  comments: JsonNodeComment[];
}

export interface JsonNodeComment {
  position: 'leading' | 'trailing';
  kind: 'line' | 'block';
  offset: number;
  length: number;
  text: string;
  content: string;
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
  const comments = scanJsonComments(text);
  return { root: buildNodeInfo(node, text, [], comments, node), errors, text };
}

function buildNodeInfo(
  node: jsonc.Node,
  text: string,
  path: JSONPath,
  comments: ScannedComment[],
  commentTarget: jsonc.Node
): JsonNodeInfo {
  const type = mapNodeType(node.type);
  const info: JsonNodeInfo = {
    path: [...path],
    key: path.length > 0 ? path[path.length - 1] : undefined,
    value: extractValue(node, text),
    type,
    children: [],
    offset: node.offset,
    length: node.length,
    comments: collectNodeComments(text, commentTarget, comments),
  };

  if (node.type === 'object' && node.children) {
    for (const propNode of node.children) {
      if (propNode.type !== 'property' || !propNode.children || propNode.children.length < 2) continue;
      const keyNode = propNode.children[0];
      const valNode = propNode.children[1];
      const key = extractValue(keyNode, text) as string;
      info.children.push(buildNodeInfo(valNode, text, [...path, key], comments, propNode));
    }
  } else if (node.type === 'array' && node.children) {
    info.children = node.children.map((child, idx) =>
      buildNodeInfo(child, text, [...path, idx], comments, child)
    );

    // Leading comments that sit between the array's opening bracket `[` and
    // the first element belong to the array itself, not the element.
    if (info.children.length > 0) {
      const firstChild = info.children[0];
      const firstChildNode = node.children[0];
      const transfer: JsonNodeComment[] = [];
      const keep: JsonNodeComment[] = [];
      for (const comment of firstChild.comments) {
        if (comment.position === 'leading' && comment.offset > node.offset &&
            comment.offset + comment.length <= firstChildNode.offset) {
          transfer.push({ ...comment, position: 'leading' });
        } else {
          keep.push(comment);
        }
      }
      if (transfer.length > 0) {
        firstChild.comments = keep;
        info.comments = [...info.comments, ...transfer];
      }
    }
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
    case 'string':
    case 'object':
    case 'array':
      return jsonc.getNodeValue(node);
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
  return jsonc.applyEdits(text, getValueEdits(text, path, newValue));
}

export function getValueEdits(
  text: string,
  path: JSONPath,
  newValue: unknown
): JsonTextEdit[] {
  return jsonc.modify(text, path, newValue, {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
}

interface SourceCommentInfo {
  relativePath: JSONPath;
  position: 'trailing' | 'leading';
  rawText: string;
}

function collectSubtreeComments(
  text: string,
  node: jsonc.Node,
  basePath: JSONPath
): SourceCommentInfo[] {
  const allComments = scanJsonComments(text);
  const result: SourceCommentInfo[] = [];

  function walk(current: jsonc.Node, relPath: JSONPath) {
    // Trailing comment
    const trailing = getTrailingComment(text, current, allComments);
    if (trailing) {
      result.push({
        relativePath: [...relPath],
        position: 'trailing',
        rawText: trailing.text,
      });
    }
    // Leading comments
    const leading = getLeadingComments(text, current, allComments);
    for (const c of leading) {
      result.push({
        relativePath: [...relPath],
        position: 'leading',
        rawText: c.text,
      });
    }
    // Recurse into children
    if (current.children) {
      if (current.type === 'object') {
        for (const prop of current.children) {
          const keyNode = prop.children?.[0];
          const valNode = prop.children?.[1];
          if (keyNode && valNode) {
            const key = extractValue(keyNode, text) as string;
            walk(valNode, [...relPath, key]);
          }
        }
      } else if (current.type === 'array') {
        current.children.forEach((child, idx) => {
          walk(child, [...relPath, idx]);
        });
      }
    }
  }

  walk(node, []);
  return result;
}

function applyCommentsToNewNode(
  text: string,
  newPath: JSONPath,
  sourceComments: SourceCommentInfo[]
): string {
  const newTree = jsonc.parseTree(text);
  if (!newTree) return text;
  const newNode = jsonc.findNodeAtLocation(newTree, newPath);
  if (!newNode) return text;

  // Build edit list for comment insertions (process bottom-up to avoid offset shifts)
  const commentEdits: JsonTextEdit[] = [];
  const eol = detectEol(text);

  for (const sc of sourceComments) {
    const targetAbsPath = [...newPath, ...sc.relativePath];
    const targetNode = jsonc.findNodeAtLocation(newTree, targetAbsPath);
    if (!targetNode) continue;

    // Skip if target already has a comment of the same type
    if (sc.position === 'trailing') {
      const existing = getTrailingComment(text, targetNode, scanJsonComments(text));
      if (existing) continue;
      const insertOff = getTrailingCommentInsertOffset(text, targetNode);
      commentEdits.push({ offset: insertOff, length: 0, content: ` ${sc.rawText}` });
    } else {
      const existing = getLeadingComments(text, targetNode, scanJsonComments(text));
      if (existing.length > 0) continue;
      const indent = text.slice(lineStart(text, targetNode.offset), targetNode.offset);
      const lineStartOff = lineStart(text, targetNode.offset);
      commentEdits.push({
        offset: lineStartOff,
        length: 0,
        content: `${indent}${sc.rawText}${eol}`,
      });
    }
  }

  // Apply edits from bottom to top
  commentEdits.sort((a, b) => b.offset - a.offset);
  return jsonc.applyEdits(text, commentEdits);
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

  // Collect comments from source subtree before modification
  const sourceComments = collectSubtreeComments(text, sourceNode, sourcePath);

  let result: string;
  let newPath: JSONPath;

  if (isObject && typeof sourceKey === 'string') {
    const existingKeys = getSiblingKeys(tree, text, parentPath);
    const newKey = generateUniqueKey(sourceKey, existingKeys);
    const insertIndex = getObjectInsertIndex(tree, text, parentPath, sourceKey);
    const edits = jsonc.modify(text, [...parentPath, newKey], sourceValue, {
      getInsertionIndex: insertIndex === undefined ? undefined : () => insertIndex,
      formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
    });
    result = formatNodeAtPath(jsonc.applyEdits(text, edits), parentPath);
    newPath = [...parentPath, newKey];
  } else {
    const parentArr = jsonc.findNodeAtLocation(tree, parentPath);
    const idx = typeof sourceKey === 'number' ? sourceKey + 1 : parentArr?.children?.length ?? 0;
    const edits = jsonc.modify(text, [...parentPath, idx], sourceValue, {
      isArrayInsertion: true,
      formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
    });
    result = jsonc.applyEdits(text, edits);
    newPath = [...parentPath, idx];
  }

  // Restore comments from source into the new node
  if (sourceComments.length > 0) {
    result = applyCommentsToNewNode(result, newPath, sourceComments);
  }

  return { newText: result, newPath };
}

export function addField(
  text: string,
  parentPath: JSONPath,
  isObject: boolean,
  key?: string,
  value?: unknown,
  insertAfterKey?: string | number
): { newText: string; newPath: JSONPath } {
  const tree = jsonc.parseTree(text);
  if (!tree) return { newText: text, newPath: parentPath };

  if (isObject) {
    const existingKeys = getSiblingKeys(tree, text, parentPath);
    const newKey = key || generateUniqueKey('newField', existingKeys);
    const insertIndex = getObjectInsertIndex(tree, text, parentPath, insertAfterKey);
    const edits = jsonc.modify(text, [...parentPath, newKey], value ?? '', {
      getInsertionIndex: insertIndex === undefined ? undefined : () => insertIndex,
      formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
    });
    const newText = formatNodeAtPath(jsonc.applyEdits(text, edits), parentPath);
    return { newText, newPath: [...parentPath, newKey] };
  }

  const parentArr = jsonc.findNodeAtLocation(tree, parentPath);
  const idx = typeof insertAfterKey === 'number' ? insertAfterKey + 1 : parentArr?.children?.length ?? 0;
  const edits = jsonc.modify(text, [...parentPath, idx], value ?? '', {
    isArrayInsertion: true,
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
  return { newText: jsonc.applyEdits(text, edits), newPath: [...parentPath, idx] };
}

export function addFieldLike(
  text: string,
  sourcePath: JSONPath
): { newText: string; newPath: JSONPath } {
  if (sourcePath.length === 0) return { newText: text, newPath: sourcePath };
  const tree = jsonc.parseTree(text);
  if (!tree) return { newText: text, newPath: sourcePath };

  const sourceNode = jsonc.findNodeAtLocation(tree, sourcePath);
  if (!sourceNode) return { newText: text, newPath: sourcePath };

  const sourceKey = sourcePath[sourcePath.length - 1];
  const parentPath = sourcePath.slice(0, -1);
  const rawValue = text.substring(sourceNode.offset, sourceNode.offset + sourceNode.length);
  const sourceValue = jsonc.parse(rawValue);

  if (typeof sourceKey === 'string') {
    const existingKeys = getSiblingKeys(tree, text, parentPath);
    const newKey = generateUniqueKey(sourceKey, existingKeys);
    return addField(text, parentPath, true, newKey, sourceValue, sourceKey);
  }

  return addField(text, parentPath, false, undefined, sourceValue, sourceKey);
}

export function addFieldFromTemplate(
  text: string,
  parentPath: JSONPath,
  sourcePath?: JSONPath,
  key?: string
): { newText: string; newPath: JSONPath } {
  const tree = jsonc.parseTree(text);
  if (!tree) return { newText: text, newPath: parentPath };
  const parent = jsonc.findNodeAtLocation(tree, parentPath);
  if (!parent) return { newText: text, newPath: parentPath };

  if (parent.type === 'object') {
    const existingKeys = getSiblingKeys(tree, text, parentPath);
    const newKey = generateUniqueKey((key || 'newField').trim() || 'newField', existingKeys);
    const sourceNode = sourcePath ? jsonc.findNodeAtLocation(tree, sourcePath) : undefined;
    const templateValue = sourceNode ? createTemplateValue(jsonc.getNodeValue(sourceNode)) : '';
    const insertAfterKey = sourcePath?.[sourcePath.length - 1];
    return addField(text, parentPath, true, newKey, templateValue, insertAfterKey);
  }

  if (parent.type === 'array') {
    const sourceNode = sourcePath
      ? jsonc.findNodeAtLocation(tree, sourcePath)
      : parent.children?.[parent.children.length - 1];
    const sourceIndex = sourcePath?.[sourcePath.length - 1];
    const templateValue = sourceNode ? createTemplateValue(jsonc.getNodeValue(sourceNode)) : '';
    return addField(
      text,
      parentPath,
      false,
      undefined,
      templateValue,
      typeof sourceIndex === 'number' ? sourceIndex : undefined
    );
  }

  return { newText: text, newPath: parentPath };
}

export function setLeadingComment(
  text: string,
  path: JSONPath,
  content: string
): string {
  const tree = jsonc.parseTree(text);
  if (!tree) return text;
  const target = getCommentTargetNode(tree, text, path);
  if (!target) return text;

  const normalizedContent = content.trim();
  const existing = getLeadingCommentBlock(text, target);
  if (!normalizedContent) {
    if (!existing) return text;
    return applySingleEdit(text, {
      offset: existing.offset,
      length: existing.length,
      content: '',
    });
  }

  const commentText = buildLeadingLineComment(text, target, normalizedContent);
  if (existing) {
    return applySingleEdit(text, {
      offset: existing.offset,
      length: existing.length,
      content: commentText,
    });
  }

  return applySingleEdit(text, {
    offset: lineStart(text, target.offset),
    length: 0,
    content: commentText,
  });
}

export function setTrailingComment(
  text: string,
  path: JSONPath,
  content: string
): string {
  const tree = jsonc.parseTree(text);
  if (!tree) return text;
  const target = getCommentTargetNode(tree, text, path);
  if (!target) return text;

  const normalizedContent = content.trim();
  const existing = getTrailingCommentBlock(text, target);
  if (!normalizedContent) {
    if (!existing) return text;
    return applySingleEdit(text, {
      offset: existing.offset,
      length: existing.length,
      content: '',
    });
  }

  const commentText = ` // ${normalizedContent}`;
  if (existing) {
    return applySingleEdit(text, {
      offset: existing.offset,
      length: existing.length,
      content: commentText,
    });
  }

  return applySingleEdit(text, {
    offset: getTrailingCommentInsertOffset(text, target),
    length: 0,
    content: commentText,
  });
}

export function removeField(text: string, path: JSONPath): string {
  const edits = jsonc.modify(text, path, undefined, {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
  return jsonc.applyEdits(text, edits);
}

export function renameObjectKey(
  text: string,
  path: JSONPath,
  requestedKey: string
): { newText: string; newPath: JSONPath } {
  const key = requestedKey.trim();
  if (!key || path.length === 0) return { newText: text, newPath: path };
  const oldKey = path[path.length - 1];
  if (typeof oldKey !== 'string' || oldKey === key) return { newText: text, newPath: path };

  const tree = jsonc.parseTree(text);
  if (!tree) return { newText: text, newPath: path };
  const parentPath = path.slice(0, -1);
  const parent = jsonc.findNodeAtLocation(tree, parentPath);
  if (!parent || parent.type !== 'object' || !parent.children) return { newText: text, newPath: path };

  const existing = getSiblingKeys(tree, text, parentPath).filter((existingKey) => existingKey !== oldKey);
  const nextKey = generateUniqueKey(key, existing);
  const propNode = parent.children.find((child) => {
    const keyNode = child.children?.[0];
    return child.type === 'property' && keyNode && extractValue(keyNode, text) === oldKey;
  });
  const keyNode = propNode?.children?.[0];
  if (!keyNode) return { newText: text, newPath: path };

  const newText = applySingleEdit(text, {
    offset: keyNode.offset,
    length: keyNode.length,
    content: JSON.stringify(nextKey),
  });
  return { newText, newPath: [...parentPath, nextKey] };
}

export function moveNode(
  text: string,
  path: JSONPath,
  direction: -1 | 1
): { newText: string; newPath: JSONPath } {
  if (path.length === 0) return { newText: text, newPath: path };
  const tree = jsonc.parseTree(text);
  if (!tree) return { newText: text, newPath: path };
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = jsonc.findNodeAtLocation(tree, parentPath);
  if (!parent || !parent.children) return { newText: text, newPath: path };

  const children = parent.children;
  const index = children.findIndex((child, childIndex) => {
    if (parent.type === 'array') return key === childIndex;
    if (parent.type !== 'object') return false;
    const keyNode = child.children?.[0];
    return keyNode && extractValue(keyNode, text) === key;
  });
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= children.length) {
    return { newText: text, newPath: path };
  }

  const parentValue = jsonc.getNodeValue(parent);
  if (Array.isArray(parentValue)) {
    const nextValue = [...parentValue];
    const [moved] = nextValue.splice(index, 1);
    nextValue.splice(targetIndex, 0, moved);
    const edits = jsonc.modify(text, parentPath, nextValue, {
      formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
    });
    return {
      newText: jsonc.applyEdits(text, edits),
      newPath: [...parentPath, targetIndex],
    };
  }

  if (parent.type !== 'object' || typeof key !== 'string' || !isPlainRecord(parentValue)) {
    return { newText: text, newPath: path };
  }

  const entries = children
    .map((child) => {
      const keyNode = child.children?.[0];
      const propKey = keyNode ? extractValue(keyNode, text) : undefined;
      return typeof propKey === 'string'
        ? ([propKey, parentValue[propKey]] as const)
        : undefined;
    })
    .filter((entry): entry is readonly [string, unknown] => entry !== undefined);
  const [moved] = entries.splice(index, 1);
  entries.splice(targetIndex, 0, moved);
  const nextValue = Object.fromEntries(entries);
  const edits = jsonc.modify(text, parentPath, nextValue, {
    formattingOptions: { tabSize: 2, insertSpaces: true, eol: detectEol(text) },
  });
  const newText = jsonc.applyEdits(text, edits);

  return { newText, newPath: path };
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

function getObjectInsertIndex(
  tree: jsonc.Node,
  text: string,
  parentPath: JSONPath,
  insertAfterKey?: string | number
): number | undefined {
  if (typeof insertAfterKey !== 'string') return undefined;
  const parent = jsonc.findNodeAtLocation(tree, parentPath);
  if (!parent || parent.type !== 'object' || !parent.children) return undefined;
  const index = parent.children.findIndex((propNode) => {
    const keyNode = propNode.children?.[0];
    return keyNode && extractValue(keyNode, text) === insertAfterKey;
  });
  return index < 0 ? undefined : index + 1;
}

function applySingleEdit(text: string, edit: JsonTextEdit): string {
  return text.slice(0, edit.offset) + edit.content + text.slice(edit.offset + edit.length);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createTemplateValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const firstValue = value.find((item) => item !== null && item !== undefined);
    return firstValue === undefined ? [] : [createTemplateValue(firstValue)];
  }
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, createTemplateValue(childValue)])
    );
  }
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  if (value === null) return null;
  return '';
}

interface ScannedComment {
  kind: 'line' | 'block';
  offset: number;
  length: number;
  text: string;
}

function scanJsonComments(text: string): ScannedComment[] {
  const scanner = jsonc.createScanner(text, false);
  const comments: ScannedComment[] = [];
  let token = scanner.scan();
  while (token !== jsonc.SyntaxKind.EOF) {
    if (token === jsonc.SyntaxKind.LineCommentTrivia || token === jsonc.SyntaxKind.BlockCommentTrivia) {
      const offset = scanner.getTokenOffset();
      const length = scanner.getTokenLength();
      comments.push({
        kind: token === jsonc.SyntaxKind.LineCommentTrivia ? 'line' : 'block',
        offset,
        length,
        text: text.slice(offset, offset + length),
      });
    }
    token = scanner.scan();
  }
  return comments;
}

function collectNodeComments(
  text: string,
  target: jsonc.Node,
  comments: ScannedComment[]
): JsonNodeComment[] {
  const leading = getLeadingComments(text, target, comments).map((comment) =>
    toNodeComment(comment, 'leading' as const)
  );
  const trailing = getTrailingComment(text, target, comments);
  return trailing ? [...leading, toNodeComment(trailing, 'trailing')] : leading;
}

function toNodeComment(comment: ScannedComment, position: JsonNodeComment['position']): JsonNodeComment {
  return {
    position,
    kind: comment.kind,
    offset: comment.offset,
    length: comment.length,
    text: comment.text,
    content: stripCommentSyntax(comment.text, comment.kind),
  };
}

function getLeadingComments(
  text: string,
  target: jsonc.Node,
  comments: ScannedComment[]
): ScannedComment[] {
  const selected: ScannedComment[] = [];
  let cursor = target.offset;
  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];
    const commentEnd = comment.offset + comment.length;
    if (commentEnd > cursor) continue;
    const between = text.slice(commentEnd, cursor);
    if (!/^[\t \r\n]*$/.test(between) || countLineBreaks(between) > 1) break;
    // Ensure the comment is on its own line (only whitespace before it).
    // Otherwise it's a trailing comment of a previous property and should
    // not be collected as a leading comment for the current node.
    const linePrefix = text.slice(lineStart(text, comment.offset), comment.offset);
    if (!/^[\t ]*$/.test(linePrefix)) break;
    selected.unshift(comment);
    cursor = lineStart(text, comment.offset);
  }
  return selected;
}

function getTrailingComment(
  text: string,
  target: jsonc.Node,
  comments: ScannedComment[]
): ScannedComment | undefined {
  const targetEnd = target.offset + target.length;
  return comments.find((comment) => {
    if (comment.offset <= target.offset) return false;
    if (lineNumberAt(text, comment.offset) !== lineNumberAt(text, target.offset)) return false;
    if (comment.offset < targetEnd) return true;
    return /^[\t ,]*$/.test(text.slice(targetEnd, comment.offset));
  });
}

function getTrailingCommentBlock(text: string, target: jsonc.Node): JsonTextEdit | null {
  const comment = getTrailingComment(text, target, scanJsonComments(text));
  if (!comment) return null;
  const offset = trailingWhitespaceStart(text, target, comment.offset);
  return {
    offset,
    length: comment.offset + comment.length - offset,
    content: text.slice(offset, comment.offset + comment.length),
  };
}

function getLeadingCommentBlock(text: string, target: jsonc.Node): JsonTextEdit | null {
  const comments = getLeadingComments(text, target, scanJsonComments(text));
  if (comments.length === 0) return null;
  const offset = lineStart(text, comments[0].offset);
  const last = comments[comments.length - 1];
  const end = lineEndWithBreak(text, last.offset + last.length);
  return { offset, length: end - offset, content: text.slice(offset, end) };
}

function getCommentTargetNode(tree: jsonc.Node, text: string, path: JSONPath): jsonc.Node | undefined {
  if (path.length === 0) return tree;
  const node = jsonc.findNodeAtLocation(tree, path);
  if (!node) return undefined;
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  if (typeof key !== 'string') return node;
  const parent = jsonc.findNodeAtLocation(tree, parentPath);
  if (!parent || parent.type !== 'object' || !parent.children) return node;
  return parent.children.find((child) => {
    const keyNode = child.children?.[0];
    return keyNode && extractValue(keyNode, text) === key;
  }) ?? node;
}

function buildLeadingLineComment(text: string, target: jsonc.Node, content: string): string {
  const eol = detectEol(text);
  const indent = text.slice(lineStart(text, target.offset), target.offset).match(/^[\t ]*/)?.[0] ?? '';
  return content
    .split(/\r\n|\r|\n/)
    .map((line) => `${indent}// ${line.trim()}`)
    .join(eol) + eol;
}

function getTrailingCommentInsertOffset(text: string, target: jsonc.Node): number {
  const lineEnd = lineEndBeforeBreak(text, target.offset + target.length);
  let offset = target.offset + target.length;
  while (offset < lineEnd && /[\t ]/.test(text[offset])) offset++;
  if (text[offset] === ',') offset++;
  while (offset < lineEnd && /[\t ]/.test(text[offset])) offset++;
  return offset;
}

function trailingWhitespaceStart(text: string, target: jsonc.Node, commentOffset: number): number {
  let offset = commentOffset;
  while (offset > target.offset && /[\t ]/.test(text[offset - 1])) offset--;
  return offset;
}

function stripCommentSyntax(text: string, kind: ScannedComment['kind']): string {
  if (kind === 'line') return text.replace(/^\/\/\s?/, '').trim();
  return text.replace(/^\/\*/, '').replace(/\*\/$/, '').trim();
}

function lineStart(text: string, offset: number): number {
  const previousLf = text.lastIndexOf('\n', Math.max(0, offset - 1));
  return previousLf < 0 ? 0 : previousLf + 1;
}

function lineEndWithBreak(text: string, offset: number): number {
  const nextLf = text.indexOf('\n', offset);
  return nextLf < 0 ? text.length : nextLf + 1;
}

function lineEndBeforeBreak(text: string, offset: number): number {
  const nextLf = text.indexOf('\n', offset);
  const end = nextLf < 0 ? text.length : nextLf;
  return end > 0 && text[end - 1] === '\r' ? end - 1 : end;
}

function lineNumberAt(text: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset; index++) {
    if (text[index] === '\n') line++;
  }
  return line;
}

function countLineBreaks(text: string): number {
  return (text.match(/\n/g) ?? []).length;
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

function formatNodeAtPath(text: string, path: JSONPath): string {
  const tree = jsonc.parseTree(text);
  const node = tree ? jsonc.findNodeAtLocation(tree, path) : undefined;
  if (!node) return text;
  const edits = jsonc.format(
    text,
    { offset: node.offset, length: node.length },
    { tabSize: 2, insertSpaces: true, eol: detectEol(text) }
  );
  return jsonc.applyEdits(text, edits);
}
