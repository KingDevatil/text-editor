import React, { useRef, useEffect } from 'react';
import * as monaco from 'monaco-editor';
// @ts-ignore
import { MenuRegistry, MenuId } from 'monaco-editor/esm/vs/platform/actions/common/actions';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Configure Monaco environment for Vite
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

// Register custom 'log' language for highlighting keywords like INFO/WARN/ERROR
monaco.languages.register({ id: 'log' });
monaco.languages.setMonarchTokensProvider('log', {
  defaultToken: '',
  tokenizer: {
    root: [
      [/\b(INFO)\b/, 'keyword.info'],
      [/\b(WARN|WARNING)\b/, 'keyword.warn'],
      [/\b(ERROR|FATAL)\b/, 'keyword.error'],
      [/\b(DEBUG)\b/, 'keyword.debug'],
      [/\b(TRACE)\b/, 'keyword.trace'],
      [/\d{4}-\d{2}-\d{2}/, 'comment.date'],
      [/\d{2}:\d{2}:\d{2}/, 'comment.time'],
    ]
  }
});

// Define theme colors for log keywords
const logRules = [
  { token: 'keyword.info.log', foreground: '4CAF50', fontStyle: 'bold' },
  { token: 'keyword.warn.log', foreground: 'FF9800', fontStyle: 'bold' },
  { token: 'keyword.error.log', foreground: 'F44336', fontStyle: 'bold' },
  { token: 'keyword.debug.log', foreground: '9E9E9E' },
  { token: 'keyword.trace.log', foreground: 'BDBDBD' },
  { token: 'comment.date.log', foreground: '2196F3' },
  { token: 'comment.time.log', foreground: '2196F3' },
];

// Override themes with log support (safe to call multiple times)
monaco.editor.defineTheme('vs', { base: 'vs', inherit: true, rules: logRules, colors: {} });
monaco.editor.defineTheme('vs-dark', { base: 'vs-dark', inherit: true, rules: logRules, colors: {} });
monaco.editor.defineTheme('hc-black', { base: 'hc-black', inherit: true, rules: logRules, colors: {} });

// Translate Monaco context menu items to Chinese
const CONTEXT_MENU_TRANSLATIONS: Record<string, string> = {
  'Undo': '撤销',
  'Redo': '恢复',
  'Cut': '剪切',
  'Copy': '复制',
  'Paste': '粘贴',
  'Select All': '全选',
  'Command Palette': '命令面板',
  'Format Document': '格式化文档',
  'Format Selection': '格式化选定内容',
  'Find': '查找',
  'Replace': '替换',
  'Go to Line...': '转到行...',
  'Go to Symbol...': '转到符号...',
  'Change All Occurrences': '更改所有匹配项',
  'Add Selection to Next Find Match': '添加选择到下一个查找匹配项',
};

function translateMenuTitle(title: string): string {
  // Handle && prefix (mnemonic marker)
  const hasPrefix = title.startsWith('&&');
  const plain = hasPrefix ? title.slice(2) : title;
  const translated = CONTEXT_MENU_TRANSLATIONS[plain];
  if (translated) {
    return hasPrefix ? '&&' + translated : translated;
  }
  return title;
}

function translateMonacoContextMenu() {
  if (!MenuRegistry) return;
  const menus = [MenuId.EditorContext, MenuId.SimpleEditorContext];
  for (const menuId of menus) {
    const items = MenuRegistry.getMenuItems(menuId);
    for (const item of items) {
      if (item.command && typeof item.command.title === 'string') {
        item.command.title = translateMenuTitle(item.command.title);
      }
      if (item.submenu && typeof item.submenu.title === 'string') {
        item.submenu.title = translateMenuTitle(item.submenu.title);
      }
    }
  }
}

interface MonacoEditorProps {
  content: string;
  language: string;
  theme: 'vs' | 'vs-dark' | 'hc-black';
  onChange: (value: string) => void;
  readOnly?: boolean;
  editorRef?: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  unicodeHighlight?: boolean;
  fontSize?: number;
}

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  content,
  language,
  theme,
  onChange,
  readOnly = false,
  editorRef: externalEditorRef,
  unicodeHighlight = false,
  fontSize = 14,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const valueRef = useRef(content);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value: content,
      language,
      theme,
      readOnly,
      minimap: { enabled: true },
      fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'monospace'",
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 5,
      roundedSelection: false,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
      wordWrap: 'on',
      wrappingStrategy: 'advanced',
      wrappingIndent: 'indent',
      folding: true,
      foldingHighlight: true,
      showFoldingControls: 'always',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },
      matchBrackets: 'always',
      autoIndent: 'full',
      formatOnPaste: true,
      formatOnType: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      unicodeHighlight: {
        ambiguousCharacters: unicodeHighlight,
        invisibleCharacters: false,
      },
    });

    editorRef.current = editor;
    if (externalEditorRef) {
      externalEditorRef.current = editor;
    }
    valueRef.current = content;

    // Translate built-in context menu items to Chinese
    translateMonacoContextMenu();

    // Helper: batch format JSON in selection
    const applyJsonFormat = (ed: monaco.editor.ICodeEditor, indent: number | undefined) => {
      const model = ed.getModel();
      const selection = ed.getSelection();
      if (!model || !selection) return;

      const startLine = selection.startLineNumber;
      const endLine = selection.endLineNumber;
      const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];

      for (let line = startLine; line <= endLine; line++) {
        const lineContent = model.getLineContent(line);
        const trimmed = lineContent.trim();
        if (!trimmed) continue;

        // Try parse entire trimmed line as JSON
        try {
          const parsed = JSON.parse(trimmed);
          const formatted = JSON.stringify(parsed, null, indent);
          const maxCol = model.getLineMaxColumn(line);
          edits.push({
            range: new monaco.Range(line, 1, line, maxCol),
            text: formatted,
            forceMoveMarkers: true,
          });
          continue;
        } catch {
          // Not pure JSON line, try extract JSON substring
        }

        // Try extract JSON substring from line (e.g. log prefix + JSON)
        const openBrace = trimmed.indexOf('{');
        const openBracket = trimmed.indexOf('[');
        const startBrace = Math.min(
          openBrace >= 0 ? openBrace : Infinity,
          openBracket >= 0 ? openBracket : Infinity
        );
        const closeBrace = trimmed.lastIndexOf('}');
        const closeBracket = trimmed.lastIndexOf(']');
        const endBrace = Math.max(closeBrace, closeBracket);

        if (startBrace !== Infinity && endBrace !== -1 && startBrace < endBrace) {
          const candidate = trimmed.substring(startBrace, endBrace + 1);
          try {
            const parsed = JSON.parse(candidate);
            const formatted = JSON.stringify(parsed, null, indent);
            const leadingSpaces = lineContent.length - lineContent.trimStart().length;
            const actualStart = leadingSpaces + startBrace + 1; // 1-based column
            const actualEnd = leadingSpaces + endBrace + 2;     // inclusive end column
            edits.push({
              range: new monaco.Range(line, actualStart, line, actualEnd),
              text: formatted,
              forceMoveMarkers: true,
            });
          } catch {
            // Not valid JSON
          }
        }
      }

      if (edits.length > 0) {
        ed.executeEdits('format-json-batch', edits);
      }
    };

    // Register context menu action: Format Selected JSON
    const actionPretty = editor.addAction({
      id: 'format-selected-json',
      label: '格式化选中 JSON',
      contextMenuGroupId: '9_cutcopypaste',
      contextMenuOrder: 2,
      run: (ed) => applyJsonFormat(ed, 2),
    });

    const disposable = editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue();
      valueRef.current = newValue;
      onChange(newValue);
    });

    editor.focus();

    return () => {
      actionPretty.dispose();
      disposable.dispose();
      editor.dispose();
      editorRef.current = null;
      if (externalEditorRef) {
        externalEditorRef.current = null;
      }
    };
  }, []); // Create once

  // Update theme
  useEffect(() => {
    monaco.editor.setTheme(theme);
  }, [theme]);

  // Update unicodeHighlight
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      unicodeHighlight: {
        ambiguousCharacters: unicodeHighlight,
        invisibleCharacters: false,
      },
    });
  }, [unicodeHighlight]);

  // Update fontSize
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ fontSize });
  }, [fontSize]);

  // Update language (syntax highlighting) without recreating editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
    }
  }, [language]);

  // Update content from props (only if different from current editor value)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (content !== editor.getValue()) {
      editor.setValue(content);
    }
  }, [content]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default MonacoEditor;
