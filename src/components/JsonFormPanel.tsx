import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2, Search, X, AlertCircle } from 'lucide-react';
import { undo, redo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { isTauri } from '@tauri-apps/api/core';
import { open, message } from '@tauri-apps/plugin-dialog';
import { subscribeContentChange, getActiveView } from '../hooks/useEditorStatePool';
import { readFileAuto } from '../hooks/useFileOpener';
import {
  parseJsonc,
  applyValueEdit,
  copyNode,
  addField,
  appendFields,
  addFieldFromTemplate,
  removeField,
  renameObjectKey,
  moveNode,
  setLeadingComment,
  setTrailingComment,
} from '../utils/jsoncParser';
import type { JsonNodeInfo, JSONPath, JsonTextEdit } from '../utils/jsoncParser';
import type { ParseError } from 'jsonc-parser';
import JsonFormField from './JsonFormField';
import { FormSearchContext } from './FormSearchContext';
import { analyzeJsonForm } from '../utils/jsonFormAnalysis';
import type { JsonFormIssue } from '../utils/jsonFormAnalysis';
import { parseTabDelimitedObjects } from '../utils/tabularImport';

interface JsonFormPanelProps {
  tabId: string;
  visible: boolean;
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onExitFullScreen?: () => void;
}

const JsonFormPanel: React.FC<JsonFormPanelProps> = React.memo(({
  tabId, visible, fullScreen = false, onToggleFullScreen, onExitFullScreen,
}) => {
  const [text, setText] = useState('');
  const [parsedTree, setParsedTree] = useState<JsonNodeInfo | null>(null);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [issues, setIssues] = useState<JsonFormIssue[]>([]);
  const [editingLongText, setEditingLongText] = useState<{ path: JSONPath; value: string } | null>(null);
  const [longTextDraft, setLongTextDraft] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingEditRef = useRef(false);
  const pendingBrowserImportPathRef = useRef<JSONPath | null>(null);
  const browserImportInputRef = useRef<HTMLInputElement>(null);

  // ── Search state ─────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo<JSONPath[]>(() => {
    if (!searchQuery.trim() || !parsedTree) return [];
    const q = searchQuery.toLowerCase();
    const result: JSONPath[] = [];
    const walk = (node: JsonNodeInfo) => {
      const keyMatch = typeof node.key === 'string' && node.key.toLowerCase().includes(q);
      const valMatch = (node.type === 'string' || node.type === 'number' || node.type === 'boolean')
        && node.value !== null && node.value !== undefined
        && String(node.value).toLowerCase().includes(q);
      const commentMatch = node.comments.some((c) => c.content.toLowerCase().includes(q));
      if (keyMatch || valMatch || commentMatch) result.push([...node.path]);
      node.children.forEach(walk);
    };
    walk(parsedTree);
    return result;
  }, [searchQuery, parsedTree]);

  const currentPath = matchIndex < matches.length ? matches[matchIndex] : null;

  const searchCtx = useMemo(() => ({
    query: searchQuery.trim(),
    currentPath,
    registerRef: (path: JSONPath, el: HTMLElement | null) => {
      const k = JSON.stringify(path);
      if (el) nodeRefs.current.set(k, el);
      else nodeRefs.current.delete(k);
    },
  }), [searchQuery, currentPath]);

  const scrollToMatch = useCallback((path: JSONPath | null) => {
    if (!path) return;
    const el = nodeRefs.current.get(JSON.stringify(path));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (matchIndex + 1) % matches.length;
    setMatchIndex(next);
    scrollToMatch(matches[next]);
  }, [matches, matchIndex, scrollToMatch]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (matchIndex - 1 + matches.length) % matches.length;
    setMatchIndex(prev);
    scrollToMatch(matches[prev]);
  }, [matches, matchIndex, scrollToMatch]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isEditableShortcutTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const view = getActiveView(tabId);
      if (!view) return;

      if (key === 'z' && !e.shiftKey) {
        if (undo(view)) e.preventDefault();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        if (redo(view)) e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabId, visible]);

  // Close search on Escape (only when search bar is focused)
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  useEffect(() => {
    if (!visible) return;
    const unsubscribe = subscribeContentChange(tabId, (newContent) => {
      if (applyingEditRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setText(newContent), 100);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tabId, visible]);

  useEffect(() => {
    if (!text) { setParsedTree(null); setParseErrors([]); setIssues([]); return; }
    const { root, errors } = parseJsonc(text);
    setParsedTree(root);
    setParseErrors(errors);
    setIssues(errors.length ? [] : analyzeJsonForm(root));
  }, [text]);

  const applyEditsToEditor = useCallback((edits: JsonTextEdit[]) => {
    const view = getActiveView(tabId);
    if (!view || edits.length === 0) return false;
    view.dispatch({
      changes: edits
        .slice()
        .sort((a, b) => a.offset - b.offset)
        .map((edit) => ({
          from: edit.offset,
          to: edit.offset + edit.length,
          insert: normalizeInsertForView(edit.content, view.state),
        })),
    });
    return true;
    // Don't call setText here — the subscribeContentChange callback will
    // pick up the editor change after its 300 ms debounce, avoiding a
    // double parse (immediate + subscriber) on every edit.
  }, [tabId]);

  const applyToEditor = useCallback((newText: string) => {
    const edit = getMinimalEdit(text, newText);
    if (!edit) return;
    applyingEditRef.current = true;
    const applied = applyEditsToEditor([edit]);
    if (!applied) {
      applyingEditRef.current = false;
      return;
    }
    setText(newText);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setTimeout(() => { applyingEditRef.current = false; }, 0);
  }, [text, applyEditsToEditor]);

  const handleEdit = useCallback((path: JSONPath, newValue: unknown) => {
    const newText = applyValueEdit(text, path, newValue);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleCopy = useCallback((parentPath: JSONPath, sourceKey: string | number, isObject: boolean) => {
    const { newText } = copyNode(text, parentPath, sourceKey, isObject);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleAddLike = useCallback((path: JSONPath) => {
    const { newText } = addFieldFromTemplate(text, path.slice(0, -1), path);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleDelete = useCallback((path: JSONPath) => {
    const newText = removeField(text, path);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleAdd = useCallback((parentPath: JSONPath, isObject: boolean, key?: string) => {
    if (isObject) {
      if (!key?.trim()) return;
      const { newText } = addField(text, parentPath, true, key.trim(), '');
      applyToEditor(newText);
      return;
    }
    if (!isObject) {
      const parentNode = findNode(parsedTree, parentPath);
      const lastChild = parentNode?.children[parentNode.children.length - 1];
      if (lastChild) {
        const { newText } = addFieldFromTemplate(text, parentPath, lastChild.path);
        applyToEditor(newText);
        return;
      }
    }
    const { newText } = addField(text, parentPath, isObject);
    applyToEditor(newText);
  }, [text, parsedTree, applyToEditor]);

  const handleRename = useCallback((path: JSONPath, newKey: string) => {
    const { newText } = renameObjectKey(text, path, newKey);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleMove = useCallback((path: JSONPath, direction: -1 | 1) => {
    const { newText } = moveNode(text, path, direction);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleEditComment = useCallback((path: JSONPath, content: string, position: 'leading' | 'trailing') => {
    const newText = position === 'trailing'
      ? setTrailingComment(text, path, content)
      : setLeadingComment(text, path, content);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleEditText = useCallback((path: JSONPath, value: string) => {
    setEditingLongText({ path, value });
    setLongTextDraft(value);
  }, []);

  const handleSaveLongText = useCallback(() => {
    if (!editingLongText) return;
    const newText = applyValueEdit(text, editingLongText.path, longTextDraft);
    applyToEditor(newText);
    setEditingLongText(null);
  }, [text, editingLongText, longTextDraft, applyToEditor]);

  const appendImportedRows = useCallback((targetPath: JSONPath, fileText: string) => {
    const targetNode = findNode(parsedTree, targetPath);
    if (!targetNode || (targetNode.type !== 'object' && targetNode.type !== 'array')) {
      throw new Error('只能导入到对象或数组节点');
    }

    const { headers, rows } = parseTabDelimitedObjects(fileText, {
      fieldTypeHints: getImportFieldTypeHints(targetNode),
    });
    let nextText: string;
    if (targetNode.type === 'array') {
      nextText = appendFields(text, targetPath, false, rows.map((row) => ({ value: row })));
    } else {
      const usedKeys = new Set(
        targetNode.children
          .map((child) => child.key)
          .filter((key): key is string => typeof key === 'string')
      );
      const keyHeader = headers[0];
      const entries: Array<{ key: string; value: Record<string, unknown> }> = [];
      for (const row of rows) {
        const baseKey = String(row[keyHeader] ?? '').trim() || keyHeader;
        const key = uniqueObjectKey(baseKey, usedKeys);
        usedKeys.add(key);
        entries.push({ key, value: row });
      }
      nextText = appendFields(text, targetPath, true, entries);
    }

    applyToEditor(nextText);
  }, [text, parsedTree, applyToEditor]);

  const handleBatchImport = useCallback(async (targetPath: JSONPath) => {
    try {
      if (isTauri()) {
        const selected = await open({
          multiple: false,
          filters: [{ name: 'Text', extensions: ['txt', 'tsv'] }],
        });
        if (!selected || Array.isArray(selected)) return;
        const { text: importedText } = await readFileAuto(selected);
        appendImportedRows(targetPath, importedText);
        return;
      }

      pendingBrowserImportPathRef.current = targetPath;
      browserImportInputRef.current?.click();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (isTauri()) await message(text, { title: '批量导入失败', kind: 'error' });
      else window.alert(text);
    }
  }, [appendImportedRows]);

  const handleBrowserImportSelected = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const targetPath = pendingBrowserImportPathRef.current;
    event.target.value = '';
    pendingBrowserImportPathRef.current = null;
    if (!file || !targetPath) return;

    try {
      appendImportedRows(targetPath, await file.text());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }, [appendImportedRows]);

  return (
    <div
      className={`json-form-panel flex flex-col w-full h-full overflow-hidden ${fullScreen ? 'absolute inset-0 z-30' : ''}`}
      style={{ backgroundColor: 'var(--te-bg-primary)' }}
    >
      <div
        className="flex items-center justify-between px-3 h-9 border-b shrink-0"
        style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--te-text-secondary)' }}>
          JSON 表单
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            title="查找"
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
            style={{ color: searchOpen ? 'var(--te-primary)' : 'var(--te-text-primary)' }}
          >
            <Search size={14} />
          </button>
          {onToggleFullScreen && (
            <button
              onClick={onToggleFullScreen}
              title={fullScreen ? '退出全屏' : '全屏'}
              className="flex items-center justify-center w-7 h-7 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
              style={{ color: 'var(--te-text-primary)' }}
            >
              {fullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
          {fullScreen && onExitFullScreen && (
            <button
              onClick={onExitFullScreen}
              title="关闭表单"
              className="flex items-center justify-center w-7 h-7 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
              style={{ color: 'var(--te-text-primary)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0"
          style={{ backgroundColor: 'var(--te-bg-secondary)', borderColor: 'var(--te-border)' }}
        >
          <Search size={13} style={{ color: 'var(--te-text-secondary)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            className="flex-1 min-w-0 px-2 py-1 rounded border text-xs"
            style={{
              borderColor: 'var(--te-border)',
              color: 'var(--te-text-primary)',
              backgroundColor: 'var(--te-bg-primary)',
            }}
            placeholder="搜索 key、value、注释..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setMatchIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) goPrev();
                else goNext();
              }
              if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
            }}
            autoFocus
          />
          <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--te-text-secondary)', minWidth: 48, textAlign: 'center' }}>
            {matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : searchQuery ? '无结果' : ''}
          </span>
          <button
            onClick={goPrev}
            disabled={matches.length === 0}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)] disabled:opacity-30"
            style={{ color: 'var(--te-text-primary)' }}
            title="上一个 (Shift+Enter)"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={goNext}
            disabled={matches.length === 0}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)] disabled:opacity-30"
            style={{ color: 'var(--te-text-primary)' }}
            title="下一个 (Enter)"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
            style={{ color: 'var(--te-text-secondary)' }}
            title="关闭 (Esc)"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {parseErrors.length > 0 && (
          <div className="flex items-start gap-2 p-2 mb-2 rounded text-xs" style={{ backgroundColor: 'color-mix(in srgb, var(--te-error, #ef4444) 10%, transparent)', color: 'var(--te-error, #ef4444)' }}>
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div>
              {parseErrors.slice(0, 3).map((err, i) => (
                <div key={i}>解析错误 (offset: {err.offset}, code: {err.error})</div>
              ))}
              {parseErrors.length > 3 && <div>...还有 {parseErrors.length - 3} 个错误</div>}
            </div>
          </div>
        )}

        {issues.length > 0 && (
          <div
            className="mb-2 rounded border p-2 text-xs"
            style={{
              borderColor: 'var(--te-border)',
              backgroundColor: 'var(--te-bg-secondary)',
              color: 'var(--te-text-primary)',
            }}
          >
            <div className="mb-1 font-medium" style={{ color: 'var(--te-text-secondary)' }}>
              配置检查：{issues.filter((issue) => issue.severity === 'error').length} 个错误 / {issues.filter((issue) => issue.severity === 'warning').length} 个提醒
            </div>
            {issues.slice(0, 5).map((issue, index) => (
              <div key={`${issue.path.join('.')}-${index}`} className="flex gap-1 leading-5">
                <span style={{ color: issue.severity === 'error' ? 'var(--te-error, #ef4444)' : 'var(--te-warning, #f59e0b)' }}>
                  {issue.severity === 'error' ? '错误' : '提醒'}
                </span>
                <span style={{ color: 'var(--te-text-secondary)' }}>
                  {formatPath(issue.path)}
                </span>
                <span>{issue.message}</span>
              </div>
            ))}
            {issues.length > 5 && (
              <div style={{ color: 'var(--te-text-secondary)' }}>
                还有 {issues.length - 5} 条检查结果
              </div>
            )}
          </div>
        )}

        {parsedTree ? (
          <JsonFormErrorBoundary>
            <FormSearchContext.Provider value={searchQuery.trim() ? searchCtx : null}>
              <JsonFormField
                node={parsedTree}
                pathKey="root"
                issues={issues}
                onEdit={handleEdit}
                onCopy={handleCopy}
                onAddLike={handleAddLike}
                onDelete={handleDelete}
                onAdd={handleAdd}
                onRename={handleRename}
                onMove={handleMove}
                onEditComment={handleEditComment}
                onEditText={handleEditText}
                onBatchImport={handleBatchImport}
                depth={0}
                isRoot
              />
            </FormSearchContext.Provider>
          </JsonFormErrorBoundary>
        ) : (
          !parseErrors.length && (
            <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              无内容
            </div>
          )
        )}
      </div>

      {editingLongText && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div
            className="flex flex-col w-[600px] max-w-[90vw] max-h-[80vh] rounded-lg border shadow-lg"
            style={{ backgroundColor: 'var(--te-bg-primary)', borderColor: 'var(--te-border)' }}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--te-border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>编辑文本</span>
              <button
                onClick={() => setEditingLongText(null)}
                className="flex items-center justify-center w-7 h-7 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
                style={{ color: 'var(--te-text-primary)' }}
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              className="flex-1 min-h-[200px] p-4 text-sm resize-y rounded border"
              style={{
                color: 'var(--te-text-primary)',
                backgroundColor: 'var(--te-bg-primary)',
                borderColor: 'var(--te-border)',
              }}
              value={longTextDraft}
              onChange={(e) => setLongTextDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.altKey) {
                  e.preventDefault();
                  handleSaveLongText();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingLongText(null);
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2 px-4 py-2 border-t" style={{ borderColor: 'var(--te-border)' }}>
              <button
                className="px-3 py-1 text-sm rounded"
                style={{ color: 'var(--te-text-secondary)' }}
                onClick={() => setEditingLongText(null)}
              >
                取消
              </button>
              <button
                className="px-3 py-1 text-sm rounded"
                style={{ backgroundColor: 'var(--te-primary)', color: '#ffffff' }}
                onClick={handleSaveLongText}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={browserImportInputRef}
        type="file"
        accept=".txt,.tsv,text/plain,text/tab-separated-values"
        className="hidden"
        onChange={handleBrowserImportSelected}
      />
    </div>
  );
});

export default JsonFormPanel;
JsonFormPanel.displayName = 'JsonFormPanel';

class JsonFormErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-xs" style={{ color: 'var(--te-error, #ef4444)' }}>
          <span>表单渲染出错，请切换到源码模式检查 JSON 格式。</span>
          <button
            className="px-2 py-1 rounded text-xs"
            style={{ color: 'var(--te-text-secondary)', border: '1px solid var(--te-border)' }}
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function getMinimalEdit(oldText: string, newText: string): JsonTextEdit | null {
  if (oldText === newText) return null;

  let start = 0;
  const oldLength = oldText.length;
  const newLength = newText.length;
  while (start < oldLength && start < newLength && oldText[start] === newText[start]) {
    start++;
  }

  let oldEnd = oldLength;
  let newEnd = newLength;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  return {
    offset: start,
    length: oldEnd - start,
    content: newText.slice(start, newEnd),
  };
}

function findNode(root: JsonNodeInfo | null, path: JSONPath): JsonNodeInfo | null {
  if (!root) return null;
  if (path.length === 0) return root;
  let current: JsonNodeInfo | undefined = root;
  for (const segment of path) {
    current = current.children.find((child) => child.key === segment);
    if (!current) return null;
  }
  return current;
}

function uniqueObjectKey(baseKey: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(baseKey)) return baseKey;
  let index = 1;
  let candidate = `${baseKey}_${index}`;
  while (usedKeys.has(candidate)) {
    index += 1;
    candidate = `${baseKey}_${index}`;
  }
  return candidate;
}

function getImportFieldTypeHints(parentNode: JsonNodeInfo): Record<string, unknown> {
  const valuesByField = new Map<string, unknown[]>();

  for (const child of parentNode.children) {
    if (child.type !== 'object') continue;
    for (const field of child.children) {
      if (typeof field.key !== 'string') continue;
      const values = valuesByField.get(field.key) ?? [];
      values.push(field.value);
      valuesByField.set(field.key, values);
    }
  }

  const hints: Record<string, unknown> = {};
  for (const [field, values] of valuesByField.entries()) {
    const hint = chooseImportTypeHint(values);
    if (hint !== undefined) hints[field] = hint;
  }
  return hints;
}

function chooseImportTypeHint(values: unknown[]): unknown {
  const buckets = new Map<string, { count: number; sample: unknown; rank: number }>();
  for (const value of values) {
    const kind = importTypeKind(value);
    const rank = importHintRank(value);
    const bucket = buckets.get(kind);
    if (!bucket) {
      buckets.set(kind, { count: 1, sample: value, rank });
      continue;
    }
    bucket.count += 1;
    if (rank > bucket.rank) {
      bucket.sample = value;
      bucket.rank = rank;
    }
  }

  let best: { count: number; sample: unknown; rank: number } | undefined;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count || (bucket.count === best.count && bucket.rank > best.rank)) {
      best = bucket;
    }
  }
  return best?.sample;
}

function importTypeKind(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function importHintRank(value: unknown): number {
  if (Array.isArray(value)) return value.length > 0 ? 5 : 3;
  if (typeof value === 'object' && value !== null) return 4;
  if (typeof value === 'number' || typeof value === 'boolean') return 3;
  if (typeof value === 'string') return value.trim() ? 2 : 0;
  if (value === null) return 1;
  return 0;
}

function formatPath(path: JSONPath): string {
  if (path.length === 0) return '$';
  return path.reduce<string>((acc, segment) => (
    typeof segment === 'number' ? `${acc}[${segment}]` : `${acc}.${segment}`
  ), '$');
}

function normalizeInsertForView(content: string, state: EditorState): string {
  const separator = state.facet(EditorState.lineSeparator) || '\n';
  if (separator === '\n') return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lf = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return lf.replace(/\n/g, separator);
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input'
    || tag === 'textarea'
    || tag === 'select'
    || target.isContentEditable;
}
