import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, X, AlertCircle } from 'lucide-react';
import { EditorState } from '@codemirror/state';
import { subscribeContentChange, getActiveView } from '../hooks/useEditorStatePool';
import {
  parseJsonc,
  applyValueEdit,
  copyNode,
  addField,
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
import { analyzeJsonForm } from '../utils/jsonFormAnalysis';
import type { JsonFormIssue } from '../utils/jsonFormAnalysis';

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

  useEffect(() => {
    if (!visible) return;
    const unsubscribe = subscribeContentChange(tabId, (newContent) => {
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

  const applyEditsToEditor = useCallback((edits: JsonTextEdit[], _newText: string) => {
    const view = getActiveView(tabId);
    if (!view) return;
    if (edits.length === 0) return;
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
    // Don't call setText here — the subscribeContentChange callback will
    // pick up the editor change after its 300 ms debounce, avoiding a
    // double parse (immediate + subscriber) on every edit.
  }, [tabId]);

  const applyToEditor = useCallback((newText: string) => {
    const edit = getMinimalEdit(text, newText);
    if (!edit) return;
    applyEditsToEditor([edit], newText);
    // Immediately update local text to avoid waiting for editor notification
    setText(newText);
    // Clear any pending debounce to avoid double update
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
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

  return (
    <div
      className={`flex flex-col w-full h-full overflow-hidden ${fullScreen ? 'absolute inset-0 z-30' : ''}`}
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
            depth={0}
            isRoot
          />
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
              className="flex-1 min-h-[200px] p-4 text-sm resize-y"
              style={{ color: 'var(--te-text-primary)', backgroundColor: 'var(--te-bg-primary)' }}
              value={longTextDraft}
              onChange={(e) => setLongTextDraft(e.target.value)}
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
    </div>
  );
});

export default JsonFormPanel;
JsonFormPanel.displayName = 'JsonFormPanel';

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
