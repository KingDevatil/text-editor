export interface EditorTab {
  id: string;
  title: string;
  language: Language;
  isDirty: boolean;
  revision?: number;
  filePath?: string;
  encoding: Encoding;
  group?: 1 | 2;
  initialContent?: string;
  columnAlignEnabled?: boolean;
  lineEnding?: LineEnding;
}

export type Encoding =
  | 'UTF-8'
  | 'UTF-8 BOM'
  | 'UTF-16LE'
  | 'UTF-16BE'
  | 'ANSI'
  | 'GBK'
  | 'GB2312'
  | 'GB18030'
  | 'BIG5'
  | 'Shift-JIS'
  | 'EUC-KR'
  | 'ISO-8859-1'
  | 'Windows-1252';

export type LineEnding = 'CRLF' | 'LF' | 'CR' | 'Mixed';

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export type Language =
  | 'plaintext'
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'json'
  | 'jsonl'
  | 'python'
  | 'java'
  | 'cpp'
  | 'c'
  | 'csharp'
  | 'rust'
  | 'go'
  | 'markdown'
  | 'yaml'
  | 'xml'
  | 'sql'
  | 'shell'
  | 'ini'
  | 'log';

export type ThemeMode = 'light' | 'dark' | 'custom';
export type SyntaxHighlightMode = 'auto' | 'light' | 'dark';

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  primaryText: string;
  toolbarButtonText: string;
  editorGutterBg: string;
  editorGutterText: string;
  editorBracketMatch: string;
  editorNonmatchingBracket: string;
  editorCursor: string;
  editorSelection: string;
  editorActiveLine: string;
  editorMatchHighlight: string;
  editorSelectionMatch: string;
  editorSearchMatchActiveBg: string;
  editorSearchMatchActiveText: string;
  tabActiveBg: string;
  tabInactiveBg: string;
  success: string;
  warning: string;
  error: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
}

export type PartialThemeColors = Partial<ThemeColors>;

export const EXT_TO_LANGUAGE: Record<string, Language> = {
  txt: 'plaintext',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  jsonl: 'jsonl',
  py: 'python',
  pyw: 'python',
  java: 'java',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  rs: 'rust',
  go: 'go',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  wsdl: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  sql: 'sql',
  mysql: 'sql',
  pgsql: 'sql',
  sqlite: 'sql',
  ini: 'ini',
  cfg: 'ini',
  inf: 'ini',
  csv: 'plaintext',
  tsv: 'plaintext',
  env: 'plaintext',
  properties: 'ini',
  log: 'log',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
};

export type RegexConditionType =
  | 'literal'
  | 'digit'
  | 'letter'
  | 'lowerLetter'
  | 'upperLetter'
  | 'alphaNumeric'
  | 'hexDigit'
  | 'word'
  | 'space'
  | 'any'
  | 'lineStart'
  | 'lineEnd'
  | 'wordBoundary'
  | 'customSet'
  | 'charRange'
  | 'group'
  | 'or';

export type RegexQuantifier =
  | 'exactly-one'
  | 'zero-or-one'
  | 'zero-or-more'
  | 'one-or-more'
  | 'exactly-n'
  | 'range'
  | 'at-least-n';

export interface RegexCondition {
  id: string;
  type: RegexConditionType;
  value?: string;
  quantifier: RegexQuantifier;
  quantifierValue?: { n?: number; m?: number };
  capture?: boolean;
  children?: RegexCondition[];
}
