import type { JsonNodeInfo, JSONPath } from './jsoncParser';

export type JsonFormIssueSeverity = 'error' | 'warning';

export interface JsonFormIssue {
  severity: JsonFormIssueSeverity;
  path: JSONPath;
  message: string;
}

const IDENTITY_KEY_PATTERN = /^(id|key|code|uid|uuid|name)$/i;

export function analyzeJsonForm(root: JsonNodeInfo | null): JsonFormIssue[] {
  if (!root) return [];
  const issues: JsonFormIssue[] = [];
  visit(root, issues);
  return issues;
}

function visit(node: JsonNodeInfo, issues: JsonFormIssue[]): void {
  if (node.type === 'array') {
    analyzeObjectArray(node, issues);
  }
  for (const child of node.children) {
    visit(child, issues);
  }
}

function analyzeObjectArray(arrayNode: JsonNodeInfo, issues: JsonFormIssue[]): void {
  const objectItems = arrayNode.children.filter((child) => child.type === 'object');
  if (objectItems.length < 2 || objectItems.length !== arrayNode.children.length) return;

  const keyCounts = new Map<string, number>();
  for (const item of objectItems) {
    for (const key of objectKeys(item)) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }

  const commonKeys = [...keyCounts.entries()]
    .filter(([, count]) => count === objectItems.length)
    .map(([key]) => key);
  const almostCommonKeys = [...keyCounts.entries()]
    .filter(([, count]) => count >= Math.max(2, objectItems.length - 1))
    .map(([key]) => key);
  const expectedKeys = new Set([...commonKeys, ...almostCommonKeys]);

  for (const item of objectItems) {
    const keys = new Set(objectKeys(item));
    for (const key of expectedKeys) {
      if (!keys.has(key)) {
        issues.push({
          severity: 'warning',
          path: item.path,
          message: `同类数组元素缺少字段 "${key}"`,
        });
      }
    }
  }

  for (const key of commonKeys.filter((candidate) => IDENTITY_KEY_PATTERN.test(candidate))) {
    const seen = new Map<string, JSONPath>();
    for (const item of objectItems) {
      const child = item.children.find((candidate) => candidate.key === key);
      if (!child || !isScalar(child.value)) continue;
      const valueKey = String(child.value);
      const firstPath = seen.get(valueKey);
      if (firstPath) {
        issues.push({
          severity: 'error',
          path: child.path,
          message: `字段 "${key}" 的值 "${valueKey}" 在同一数组内重复`,
        });
      } else {
        seen.set(valueKey, child.path);
      }
    }
  }
}

function objectKeys(node: JsonNodeInfo): string[] {
  return node.children
    .map((child) => child.key)
    .filter((key): key is string => typeof key === 'string');
}

function isScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}
