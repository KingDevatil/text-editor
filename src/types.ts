export interface EditorTab {
  id: string;
  title: string;
  content: string;
  language: string;
  isDirty: boolean;
  filePath?: string;
  encoding: Encoding;
  group?: 1 | 2;
}

export type Encoding =
  | 'UTF-8'
  | 'UTF-8 BOM'
  | 'GBK'
  | 'GB2312'
  | 'GB18030'
  | 'BIG5'
  | 'Shift-JIS'
  | 'EUC-KR'
  | 'ISO-8859-1'
  | 'Windows-1252';

export interface EditorState {
  tabs: EditorTab[];
  activeTabId: string | null;
  theme: 'vs' | 'vs-dark' | 'hc-black';
  sidebarVisible: boolean;
  sidebarWidth: number;
  splitView: boolean;
  splitTabId: string | null;
}

export type Language =
  | 'plaintext'
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'json'
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
