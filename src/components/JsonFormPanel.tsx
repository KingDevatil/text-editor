import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, X, AlertCircle } from 'lucide-react';
import { subscribeContentChange, getActiveView } from '../hooks/useEditorStatePool';
import { parseJsonc, applyValueEdit, copyNode, addField, removeField } from '../utils/jsoncParser';
import type { JsonNodeInfo, JSONPath } from '../utils/jsoncParser';
import type { ParseError } from 'jsonc-parser';
import JsonFormField from './JsonFormField';

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
  const [editingLongText, setEditingLongText] = useState<{ path: JSONPath; value: string } | null>(null);
  const [longTextDraft, setLongTextDraft] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    const unsubscribe = subscribeContentChange(tabId, (newContent) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setText(newContent), 300);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tabId, visible]);

  useEffect(() => {
    if (!text) { setParsedTree(null); setParseErrors([]); return; }
    const { root, errors } = parseJsonc(text);
    setParsedTree(root);
    setParseErrors(errors);
  }, [text]);

  const applyToEditor = useCallback((newText: string) => {
    const view = getActiveView(tabId);
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newText },
    });
  }, [tabId]);

  const handleEdit = useCallback((path: JSONPath, newValue: unknown) => {
    const newText = applyValueEdit(text, path, newValue);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleCopy = useCallback((parentPath: JSONPath, sourceKey: string | number, isObject: boolean) => {
    const { newText } = copyNode(text, parentPath, sourceKey, isObject);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleDelete = useCallback((path: JSONPath) => {
    const newText = removeField(text, path);
    applyToEditor(newText);
  }, [text, applyToEditor]);

  const handleAdd = useCallback((parentPath: JSONPath, isObject: boolean) => {
    const { newText } = addField(text, parentPath, isObject);
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

        {parsedTree ? (
          <JsonFormField
            node={parsedTree}
            pathKey="root"
            onEdit={handleEdit}
            onCopy={handleCopy}
            onDelete={handleDelete}
            onAdd={handleAdd}
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
                style={{ backgroundColor: 'var(--te-primary)', color: 'var(--te-primary-text)' }}
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
