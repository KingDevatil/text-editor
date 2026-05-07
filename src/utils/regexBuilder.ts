import type { RegexCondition, RegexConditionType, RegexQuantifier } from '../types';

export interface ConditionConfig {
  label: string;
  icon: string;
  description: string;
  hasValue: boolean;
  defaultQuantifier: RegexQuantifier;
  category: 'text' | 'char' | 'position' | 'logic';
}

export const CONDITION_CONFIGS: Record<RegexConditionType, ConditionConfig> = {
  literal: {
    label: '精确文本',
    icon: 'Type',
    description: '匹配输入的精确文本',
    hasValue: true,
    defaultQuantifier: 'exactly-one',
    category: 'text',
  },
  digit: {
    label: '数字',
    icon: 'Hash',
    description: '匹配任意数字 (0-9)',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'char',
  },
  letter: {
    label: '字母',
    icon: 'CaseSensitive',
    description: '匹配任意字母 (a-z, A-Z)',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'char',
  },
  word: {
    label: '单词字符',
    icon: 'WholeWord',
    description: '匹配字母、数字或下划线',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'char',
  },
  space: {
    label: '空白字符',
    icon: 'Space',
    description: '匹配空格、制表符、换行等',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'char',
  },
  any: {
    label: '任意字符',
    icon: 'Asterisk',
    description: '匹配任意单个字符',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'char',
  },
  lineStart: {
    label: '行首',
    icon: 'AlignLeft',
    description: '匹配行的开始位置',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'position',
  },
  lineEnd: {
    label: '行尾',
    icon: 'AlignRight',
    description: '匹配行的结束位置',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'position',
  },
  wordBoundary: {
    label: '单词边界',
    icon: 'BetweenHorizontalStart',
    description: '匹配单词与非单词字符之间的位置',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'position',
  },
  customSet: {
    label: '字符集',
    icon: 'Brackets',
    description: '匹配方括号内的任意字符',
    hasValue: true,
    defaultQuantifier: 'exactly-one',
    category: 'char',
  },
  group: {
    label: '分组',
    icon: 'Parentheses',
    description: '将多个条件组合为一个组',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'logic',
  },
  or: {
    label: '或者',
    icon: 'GitBranch',
    description: '匹配左侧或右侧的条件',
    hasValue: false,
    defaultQuantifier: 'exactly-one',
    category: 'logic',
  },
};

export const QUANTIFIER_LABELS: Record<RegexQuantifier, { label: string; symbol: string }> = {
  'exactly-one': { label: '恰好 1 个', symbol: '' },
  'zero-or-one': { label: '可能出现', symbol: '?' },
  'zero-or-more': { label: '任意数量', symbol: '*' },
  'one-or-more': { label: '至少 1 个', symbol: '+' },
  'exactly-n': { label: '恰好 N 个', symbol: '{n}' },
  'range': { label: 'N 到 M 个', symbol: '{n,m}' },
  'at-least-n': { label: '至少 N 个', symbol: '{n,}' },
};

const TYPE_TO_REGEX: Record<RegexConditionType, (value?: string) => string> = {
  literal: (value) => escapeRegex(value || ''),
  digit: () => '\\d',
  letter: () => '[a-zA-Z]',
  word: () => '\\w',
  space: () => '\\s',
  any: () => '.',
  lineStart: () => '^',
  lineEnd: () => '$',
  wordBoundary: () => '\\b',
  customSet: (value) => `[${escapeRegexSet(value || '')}]`,
  group: () => '',
  or: () => '|',
};

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeRegexSet(str: string): string {
  return str.replace(/[\]^\\]/g, '\\$&');
}

function buildQuantifier(condition: RegexCondition): string {
  const { quantifier, quantifierValue } = condition;
  switch (quantifier) {
    case 'exactly-one': return '';
    case 'zero-or-one': return '?';
    case 'zero-or-more': return '*';
    case 'one-or-more': return '+';
    case 'exactly-n': return `{${quantifierValue?.n ?? 1}}`;
    case 'range': return `{${quantifierValue?.n ?? 1},${quantifierValue?.m ?? 1}}`;
    case 'at-least-n': return `{${quantifierValue?.n ?? 1},}`;
    default: return '';
  }
}

export function buildRegex(conditions: RegexCondition[]): { regex: string; isValid: boolean; error?: string } {
  if (conditions.length === 0) {
    return { regex: '', isValid: true };
  }

  try {
    const parts: string[] = [];
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];

      if (cond.type === 'or') {
        parts.push('|');
        continue;
      }

      if (cond.type === 'group' && cond.children && cond.children.length > 0) {
        const groupRegex = buildRegex(cond.children);
        if (!groupRegex.isValid) return groupRegex;
        const groupContent = cond.capture !== false
          ? `(${groupRegex.regex})`
          : `(?:${groupRegex.regex})`;
        parts.push(groupContent + buildQuantifier(cond));
        continue;
      }

      if (cond.type === 'literal' && (!cond.value || cond.value === '')) {
        continue;
      }

      const base = TYPE_TO_REGEX[cond.type](cond.value);
      if (base) {
        const needsGroup = cond.quantifier !== 'exactly-one' && base.length > 2;
        const part = needsGroup ? `(?:${base})${buildQuantifier(cond)}` : base + buildQuantifier(cond);
        parts.push(part);
      }
    }

    const regex = parts.join('');
    new RegExp(regex);
    return { regex, isValid: true };
  } catch (e) {
    return { regex: '', isValid: false, error: e instanceof Error ? e.message : '无效的正则表达式' };
  }
}

export function explainRegex(conditions: RegexCondition[]): string {
  if (conditions.length === 0) return '空条件';

  const parts: string[] = [];
  for (const cond of conditions) {
    const config = CONDITION_CONFIGS[cond.type];
    const quantLabel = QUANTIFIER_LABELS[cond.quantifier].label;

    if (cond.type === 'or') {
      parts.push('或');
      continue;
    }

    if (cond.type === 'group' && cond.children) {
      const groupDesc = cond.capture !== false ? '捕获组' : '非捕获组';
      const innerDesc = explainRegex(cond.children);
      parts.push(`${groupDesc}(${innerDesc})${quantLabel !== '恰好 1 个' ? `，${quantLabel}` : ''}`);
      continue;
    }

    let desc = config.label;
    if (cond.value) {
      desc += ` "${cond.value}"`;
    }
    if (quantLabel !== '恰好 1 个') {
      desc += `（${quantLabel}）`;
    }
    parts.push(desc);
  }

  return parts.join('，');
}

export function generateConditionId(): string {
  return `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createCondition(type: RegexConditionType): RegexCondition {
  const config = CONDITION_CONFIGS[type];
  return {
    id: generateConditionId(),
    type,
    value: config.hasValue ? '' : undefined,
    quantifier: config.defaultQuantifier,
    capture: type === 'group' ? true : undefined,
  };
}

export interface RegexTemplate {
  name: string;
  description: string;
  conditions: RegexCondition[];
}

export const REGEX_TEMPLATES: RegexTemplate[] = [
  {
    name: '邮箱地址',
    description: '匹配常见的电子邮件地址格式',
    conditions: [
      { id: 't1_1', type: 'word', quantifier: 'one-or-more' },
      { id: 't1_2', type: 'literal', value: '@', quantifier: 'exactly-one' },
      { id: 't1_3', type: 'word', quantifier: 'one-or-more' },
      { id: 't1_4', type: 'literal', value: '.', quantifier: 'exactly-one' },
      { id: 't1_5', type: 'letter', quantifier: 'one-or-more' },
    ],
  },
  {
    name: 'URL 链接',
    description: '匹配 http/https 开头的网址',
    conditions: [
      { id: 't2_1', type: 'literal', value: 'http', quantifier: 'exactly-one' },
      { id: 't2_2', type: 'literal', value: 's', quantifier: 'zero-or-one' },
      { id: 't2_3', type: 'literal', value: '://', quantifier: 'exactly-one' },
      { id: 't2_4', type: 'word', quantifier: 'one-or-more' },
      { id: 't2_5', type: 'literal', value: '.', quantifier: 'one-or-more' },
      { id: 't2_6', type: 'letter', quantifier: 'one-or-more' },
    ],
  },
  {
    name: 'IP 地址 (v4)',
    description: '匹配 IPv4 地址格式',
    conditions: [
      { id: 't3_1', type: 'digit', quantifier: 'one-or-more' },
      { id: 't3_2', type: 'literal', value: '.', quantifier: 'exactly-one' },
      { id: 't3_3', type: 'digit', quantifier: 'one-or-more' },
      { id: 't3_4', type: 'literal', value: '.', quantifier: 'exactly-one' },
      { id: 't3_5', type: 'digit', quantifier: 'one-or-more' },
      { id: 't3_6', type: 'literal', value: '.', quantifier: 'exactly-one' },
      { id: 't3_7', type: 'digit', quantifier: 'one-or-more' },
    ],
  },
  {
    name: '日期 (YYYY-MM-DD)',
    description: '匹配 yyyy-mm-dd 格式的日期',
    conditions: [
      { id: 't4_1', type: 'digit', quantifier: 'exactly-n', quantifierValue: { n: 4 } },
      { id: 't4_2', type: 'literal', value: '-', quantifier: 'exactly-one' },
      { id: 't4_3', type: 'digit', quantifier: 'exactly-n', quantifierValue: { n: 2 } },
      { id: 't4_4', type: 'literal', value: '-', quantifier: 'exactly-one' },
      { id: 't4_5', type: 'digit', quantifier: 'exactly-n', quantifierValue: { n: 2 } },
    ],
  },
  {
    name: '中文字符',
    description: '匹配任意中文字符',
    conditions: [
      { id: 't5_1', type: 'customSet', value: '\\u4e00-\\u9fa5', quantifier: 'one-or-more' },
    ],
  },
  {
    name: '手机号码',
    description: '匹配中国大陆手机号码',
    conditions: [
      { id: 't6_1', type: 'literal', value: '1', quantifier: 'exactly-one' },
      { id: 't6_2', type: 'customSet', value: '3-9', quantifier: 'exactly-one' },
      { id: 't6_3', type: 'digit', quantifier: 'exactly-n', quantifierValue: { n: 9 } },
    ],
  },
  {
    name: '十六进制颜色',
    description: '匹配 #RRGGBB 或 #RGB 格式',
    conditions: [
      { id: 't7_1', type: 'literal', value: '#', quantifier: 'exactly-one' },
      { id: 't7_2', type: 'customSet', value: '0-9a-fA-F', quantifier: 'exactly-n', quantifierValue: { n: 6 } },
    ],
  },
];
