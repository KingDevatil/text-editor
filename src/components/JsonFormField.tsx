import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Maximize2,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react';
import type { JsonNodeInfo, JSONPath } from '../utils/jsoncParser';
import { isSimpleArray } from '../utils/jsoncParser';
import type { JsonFormIssue } from '../utils/jsonFormAnalysis';

/* ── Search context ─────────────────────────────────────────────── */

interface FormSearchState {
  query: string;
  currentPath: JSONPath | null;
  registerRef: (path: JSONPath, el: HTMLElement | null) => void;
}

export const FormSearchContext = React.createContext<FormSearchState | null>(null);

interface JsonFormFieldProps {
  node: JsonNodeInfo;
  pathKey: string;
  issues: JsonFormIssue[];
  onEdit: (path: JSONPath, newValue: unknown) => void;
  onCopy: (parentPath: JSONPath, sourceKey: string | number, isObject: boolean) => void;
  onAddLike: (path: JSONPath) => void;
  onDelete: (path: JSONPath) => void;
  onAdd: (parentPath: JSONPath, isObject: boolean, key?: string) => void;
  onRename: (path: JSONPath, newKey: string) => void;
  onMove: (path: JSONPath, direction: -1 | 1) => void;
  onEditComment: (path: JSONPath, content: string, position: 'leading' | 'trailing') => void;
  onEditText: (path: JSONPath, value: string) => void;
  depth: number;
  isRoot?: boolean;
}

const JsonFormField: React.FC<JsonFormFieldProps> = React.memo(({
  node,
  pathKey,
  issues,
  onEdit,
  onCopy,
  onAddLike,
  onDelete,
  onAdd,
  onRename,
  onMove,
  onEditComment,
  onEditText,
  depth,
  isRoot = false,
}) => {
  const searchCtx = useContext(FormSearchContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(depth < 4);
  const [valueDraft, setValueDraft] = useState(() => valueToDraft(node));
  const [keyDraft, setKeyDraft] = useState(() => String(node.key ?? pathKey));
  const [addingField, setAddingField] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [keyWarning, setKeyWarning] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState(() => getLeadingCommentText(node));
  const [commentPosition, setCommentPosition] = useState<'leading' | 'trailing'>(() =>
    getTrailingCommentText(node) && !getLeadingCommentText(node) ? 'trailing' : 'leading'
  );
  const composingRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const indent = depth * 16;
  const nodeIssues = issues.filter((issue) => pathsEqual(issue.path, node.path));
  const descendantIssueCount = issues.filter((issue) => isDescendantPath(issue.path, node.path)).length;

  useEffect(() => {
    if (!focused && !composingRef.current) {
      setValueDraft(valueToDraft(node));
    }
  }, [focused, node]);

  useEffect(() => {
    setKeyDraft(String(node.key ?? pathKey));
  }, [node.key, pathKey]);

  useEffect(() => {
    if (!editingComment) setCommentDraft(getLeadingCommentText(node));
  }, [editingComment, node]);

  useEffect(() => () => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
  }, []);

  // ── Search: register ref & auto-expand on match ──────────────────
  const pathKey_ = useMemo(() => JSON.stringify(node.path), [node.path]);
  const isCurrentMatch = searchCtx && searchCtx.currentPath !== null
    && JSON.stringify(searchCtx.currentPath) === pathKey_;

  useEffect(() => {
    if (!searchCtx || !containerRef.current) return;
    searchCtx.registerRef(node.path, containerRef.current);
    return () => searchCtx.registerRef(node.path, null);
  }, [searchCtx, node.path]);

  // Auto-expand when this node is the current match or an ancestor of it
  const containsMatch = searchCtx && searchCtx.currentPath !== null
    && isDescendantPath(searchCtx.currentPath, node.path);
  useEffect(() => {
    if ((isCurrentMatch || containsMatch) && !expanded) setExpanded(true);
  }, [isCurrentMatch, containsMatch]);

  const handleValueChange = useCallback((newValue: unknown) => {
    onEdit(node.path, newValue);
  }, [node.path, onEdit]);

  const commitDraft = useCallback((draft = valueDraft) => {
    if (node.type === 'string') {
      handleValueChange(draft);
      return;
    }

    if (node.type === 'number') {
      if (draft.trim() === '' || !Number.isFinite(Number(draft))) return;
      handleValueChange(Number(draft));
      return;
    }

    if (node.type === 'array') {
      try {
        const parsed = JSON.parse(draft);
        if (Array.isArray(parsed)) {
          setDraftError(null);
          handleValueChange(parsed);
        }
      } catch {
        setDraftError('JSON 格式错误');
      }
    }
  }, [handleValueChange, node.type, valueDraft]);

  const scheduleDraftCommit = useCallback((draft: string) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      if (!composingRef.current) commitDraft(draft);
    }, 200);
  }, [commitDraft]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.path.length === 0) return;
    const parentPath = node.path.slice(0, -1);
    const sourceKey = node.path[node.path.length - 1];
    onCopy(parentPath, sourceKey, typeof sourceKey === 'string');
  }, [node, onCopy]);

  const handleAddLike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.path.length > 0) onAddLike(node.path);
  }, [node.path, onAddLike]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(node.path);
  }, [node.path, onDelete]);

  const handleMove = useCallback((direction: -1 | 1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onMove(node.path, direction);
  }, [node.path, onMove]);

  const handleEditComment = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const leadingText = getLeadingCommentText(node);
    const trailingText = getTrailingCommentText(node);
    const nextPosition = trailingText ? 'trailing' : 'leading';
    setCommentPosition(nextPosition);
    setCommentDraft(nextPosition === 'trailing' ? trailingText : leadingText);
    setEditingComment(true);
  }, [node]);

  const commitComment = useCallback(() => {
    onEditComment(node.path, commentDraft, commentPosition);
    setEditingComment(false);
  }, [commentDraft, commentPosition, node.path, onEditComment]);

  const handleAddChild = useCallback(() => {
    if (node.type === 'object') {
      setAddingField(true);
      setNewFieldKey('');
    }
    if (node.type === 'array') onAdd(node.path, false);
  }, [node.path, node.type, onAdd]);

  const commitNewField = useCallback(() => {
    const key = newFieldKey.trim();
    if (!key) return;
    const existingKeys = node.children.map((c) => c.key);
    if (existingKeys.includes(key)) {
      setKeyWarning(`"${key}" 已存在，将自动重命名`);
      setTimeout(() => setKeyWarning(null), 3000);
    }
    onAdd(node.path, true, key);
    setAddingField(false);
    setNewFieldKey('');
  }, [newFieldKey, node, onAdd]);

  const commitKey = useCallback(() => {
    if (typeof node.key === 'string') onRename(node.path, keyDraft);
  }, [keyDraft, node.key, node.path, onRename]);

  const renderKey = () => {
    if (isRoot) return null;

    if (typeof node.key !== 'string') {
      return (
        <span className="text-xs font-medium shrink-0" style={{ color: 'var(--te-primary)' }}>
          {pathKey}
        </span>
      );
    }

    return (
      <input
        className="w-28 min-w-0 px-1 py-0.5 rounded border text-xs font-medium"
        style={{
          borderColor: 'var(--te-border)',
          color: 'var(--te-primary)',
          backgroundColor: 'var(--te-bg-primary)',
        }}
        value={keyDraft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={commitKey}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setKeyDraft(String(node.key));
            e.currentTarget.blur();
          }
        }}
      />
    );
  };

  const renderValueInput = () => {
    switch (node.type) {
      case 'string': {
        const strVal = String(node.value ?? '');
        if (strVal.length > 80) {
          return (
            <button
              className="text-left px-2 py-0.5 rounded border text-xs truncate max-w-[240px]"
              style={{
                borderColor: 'var(--te-border)',
                color: 'var(--te-text-primary)',
                backgroundColor: 'var(--te-bg-primary)',
              }}
              onClick={() => onEditText(node.path, strVal)}
              title="编辑长文本"
            >
              {strVal.substring(0, 60)}...
              <Maximize2 size={10} className="inline ml-1 opacity-50" />
            </button>
          );
        }
        return (
          <input
            key={pathKey_}
            type="text"
            className="flex-1 min-w-0 px-2 py-0.5 rounded border text-xs"
            style={{
              borderColor: 'var(--te-border)',
              color: 'var(--te-text-primary)',
              backgroundColor: 'var(--te-bg-primary)',
            }}
            value={valueDraft}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commitDraft();
            }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              setValueDraft(e.currentTarget.value);
              scheduleDraftCommit(e.currentTarget.value);
            }}
            onChange={(e) => {
              setValueDraft(e.target.value);
              if (!composingRef.current) scheduleDraftCommit(e.target.value);
            }}
          />
        );
      }

      case 'number':
        return (
          <input
            key={pathKey_}
            type="number"
            className="w-32 px-2 py-0.5 rounded border text-xs"
            style={{
              borderColor: 'var(--te-border)',
              color: 'var(--te-text-primary)',
              backgroundColor: 'var(--te-bg-primary)',
            }}
            value={valueDraft}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commitDraft();
            }}
            onChange={(e) => {
              setValueDraft(e.target.value);
              scheduleDraftCommit(e.target.value);
            }}
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={node.value as boolean}
              onChange={(e) => handleValueChange(e.target.checked)}
            />
            <span className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              {node.value ? 'true' : 'false'}
            </span>
          </label>
        );

      case 'null':
        return (
          <span className="text-xs italic px-2 py-0.5" style={{ color: 'var(--te-text-secondary)' }}>
            null
          </span>
        );

      default:
        return null;
    }
  };

  const renderNumberArrayInput = () => {
    const values = Array.isArray(node.value) ? node.value : [];
    return (
      <div className="flex flex-wrap items-center gap-1">
        {values.map((value, index) => (
          <input
            key={index}
            type="number"
            className="w-20 px-2 py-0.5 rounded border text-xs"
            style={{
              borderColor: 'var(--te-border)',
              color: 'var(--te-text-primary)',
              backgroundColor: 'var(--te-bg-primary)',
            }}
            value={String(value)}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                const next = [...values];
                next[index] = 0;
                handleValueChange(next);
                return;
              }
              const nextValue = Number(raw);
              if (!Number.isFinite(nextValue)) return;
              const next = [...values];
              next[index] = nextValue;
              handleValueChange(next);
            }}
          />
        ))}
      </div>
    );
  };

  const renderActionButtons = () => (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <IconButton title="编辑注释" onClick={handleEditComment}>
        <MessageSquare size={12} />
      </IconButton>
      {!isRoot && (
        <>
          <IconButton title="复制到后方" onClick={handleCopy}>
            <Copy size={12} />
          </IconButton>
          <IconButton title="在后方插入同结构" onClick={handleAddLike}>
            <Plus size={12} />
          </IconButton>
          <IconButton title="上移" onClick={handleMove(-1)}>
            <ArrowUp size={12} />
          </IconButton>
          <IconButton title="下移" onClick={handleMove(1)}>
            <ArrowDown size={12} />
          </IconButton>
          <button
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-red-500/10"
            style={{ color: 'var(--te-error, #ef4444)' }}
            onClick={handleDelete}
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );

  const renderIssues = () => {
    if (nodeIssues.length === 0) return null;
    return (
      <div className="ml-1 mt-0.5 space-y-0.5 text-xs" style={{ color: 'var(--te-text-secondary)' }}>
        {nodeIssues.map((issue, index) => (
          <div key={index} style={{ color: issue.severity === 'error' ? 'var(--te-error, #ef4444)' : 'var(--te-warning, #f59e0b)' }}>
            {issue.severity === 'error' ? '错误' : '提醒'}：{issue.message}
          </div>
        ))}
      </div>
    );
  };

  const renderIssueBadge = () => {
    if (descendantIssueCount === 0) return null;
    return (
      <span
        className="px-1 py-0.5 rounded text-[10px]"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--te-warning, #f59e0b) 14%, transparent)',
          color: 'var(--te-warning, #f59e0b)',
        }}
      >
        {descendantIssueCount}
      </span>
    );
  };

  const renderCommentEditor = () => {
    const leadingText = getLeadingCommentText(node);
    const trailingText = getTrailingCommentText(node);
    if (!editingComment && !leadingText) return null;

    if (editingComment) {
      return (
        <div className="ml-6 my-1 rounded border p-1.5" style={{ borderColor: 'var(--te-border)', backgroundColor: 'var(--te-bg-secondary)' }}>
          <div className="mb-1 flex items-center gap-1">
            <button
              className="px-2 py-0.5 rounded text-xs"
              style={commentToggleStyle(commentPosition === 'leading')}
              onClick={() => {
                setCommentPosition('leading');
                setCommentDraft(leadingText);
              }}
            >
              行前
            </button>
            <button
              className="px-2 py-0.5 rounded text-xs"
              style={commentToggleStyle(commentPosition === 'trailing')}
              onClick={() => {
                setCommentPosition('trailing');
                setCommentDraft(trailingText);
              }}
            >
              行尾
            </button>
          </div>
          <textarea
            className="w-full min-h-[52px] px-2 py-1 rounded border text-xs resize-y"
            style={{
              borderColor: 'var(--te-border)',
              color: 'var(--te-text-primary)',
              backgroundColor: 'var(--te-bg-primary)',
            }}
            value={commentDraft}
            autoFocus
            placeholder="字段注释"
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditingComment(false);
                setCommentDraft(
                  commentPosition === 'trailing'
                    ? getTrailingCommentText(node)
                    : getLeadingCommentText(node)
                );
              } else if (e.key === 'Enter' && !e.altKey) {
                e.preventDefault();
                commitComment();
              }
            }}
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              className="px-2 py-0.5 rounded text-xs"
              style={{ color: 'var(--te-text-secondary)' }}
              onClick={() => {
                setCommentDraft('');
                onEditComment(node.path, '', commentPosition);
                setEditingComment(false);
              }}
            >
              清空
            </button>
            <button
              className="px-2 py-0.5 rounded text-xs"
              style={{ color: 'var(--te-text-secondary)' }}
              onClick={() => {
                setEditingComment(false);
                setCommentDraft(leadingText);
              }}
            >
              取消
            </button>
            <button
              className="px-2 py-0.5 rounded text-xs"
              style={primaryActionStyle}
              onClick={commitComment}
            >
              保存
            </button>
          </div>
        </div>
      );
    }

    // Display mode: show only leading comments as line comments
    return (
      <div className="ml-6 my-0.5 text-xs leading-5" style={{ color: 'var(--te-text-secondary)' }}>
        {leadingText && (
          <div
            className="whitespace-pre-wrap cursor-pointer hover:underline"
            onDoubleClick={handleEditComment}
            title="双击编辑注释"
          >
            // {leadingText}
          </div>
        )}
      </div>
    );
  };

  const renderInlineTrailingComment = () => {
    if (editingComment) return null;
    const trailingText = getTrailingCommentText(node);
    if (!trailingText) return null;
    return (
      <span
        className="text-xs shrink-0 cursor-pointer hover:underline"
        style={{ color: 'color-mix(in srgb, var(--te-text-secondary) 65%, transparent)' }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={handleEditComment}
        title="双击编辑注释"
      >
        // {trailingText}
      </span>
    );
  };

  if (node.type === 'object') {
    const childCount = node.children.length;
    return (
      <div ref={isRoot ? undefined : containerRef} data-path={pathKey_} style={{ marginLeft: isRoot ? 0 : indent, ...(isCurrentMatch ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 12%, transparent)', borderRadius: 4 } : {}) }}>
        {!isRoot && (
          <div
            className="flex items-center gap-1 py-1 px-1 rounded group cursor-pointer hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {renderKey()}
            <span className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              {'{'}...{'}'} ({childCount})
            </span>
            {renderIssueBadge()}
            {renderInlineTrailingComment()}
            {renderActionButtons()}
          </div>
        )}
        {renderCommentEditor()}
        {expanded && (
          <div className={isRoot ? '' : 'ml-2 border-l pl-2'} style={isRoot ? {} : { borderColor: 'var(--te-border)' }}>
            {node.children.map((child) => (
              <JsonFormField
                key={nodeKey(child)}
                node={child}
                pathKey={String(child.key ?? '')}
                issues={issues}
                onEdit={onEdit}
                onCopy={onCopy}
                onAddLike={onAddLike}
                onDelete={onDelete}
                onAdd={onAdd}
                onRename={onRename}
                onMove={onMove}
                onEditComment={onEditComment}
                onEditText={onEditText}
                depth={depth + 1}
              />
            ))}
            <button
              className="flex items-center gap-1 py-1 px-1 text-xs rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
              style={{ color: 'var(--te-text-secondary)' }}
              onClick={handleAddChild}
            >
              <Plus size={12} />
              添加字段
            </button>
            {addingField && (
              <div className="flex items-center gap-1 py-1 px-1">
                <input
                  className="w-36 px-2 py-0.5 rounded border text-xs"
                  style={{
                    borderColor: 'var(--te-border)',
                    color: 'var(--te-text-primary)',
                    backgroundColor: 'var(--te-bg-primary)',
                  }}
                  value={newFieldKey}
                  autoFocus
                  placeholder="字段名"
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitNewField();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setAddingField(false);
                      setNewFieldKey('');
                    }
                  }}
                />
                <button
                  className="px-2 py-0.5 rounded text-xs"
                  style={primaryActionStyle}
                  onClick={commitNewField}
                >
                  确定
                </button>
                <button
                  className="px-2 py-0.5 rounded text-xs"
                  style={{ color: 'var(--te-text-secondary)' }}
                  onClick={() => {
                    setAddingField(false);
                    setNewFieldKey('');
                  }}
                >
                  取消
                </button>
              </div>
            )}
            {keyWarning && (
              <div className="ml-1 text-xs" style={{ color: 'var(--te-warning, #f59e0b)' }}>
                {keyWarning}
              </div>
            )}
            {renderIssues()}
          </div>
        )}
      </div>
    );
  }

  if (node.type === 'array') {
    const childCount = node.children.length;
    const simple = isSimpleArray(node.value);
    const compactNumberArray = isCompactNumberArray(node.value);

    if (simple) {
      return (
        <div ref={isRoot ? undefined : containerRef} data-path={pathKey_} style={{ marginLeft: isRoot ? 0 : indent, ...(isCurrentMatch ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 12%, transparent)', borderRadius: 4 } : {}) }} className="py-1">
          {!isRoot && (
            <div className="flex items-center gap-1 mb-1 group">
              {renderKey()}
              <span className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
                [简单数组] ({childCount})
              </span>
              {getTrailingCommentText(node) && (
                <span
                  className="text-xs shrink-0"
                  style={{ color: 'color-mix(in srgb, var(--te-text-secondary) 65%, transparent)' }}
                >
                  {' '}// {getTrailingCommentText(node)}
                </span>
              )}
              {renderIssueBadge()}
              {renderActionButtons()}
            </div>
          )}
          {renderCommentEditor()}
          {compactNumberArray ? renderNumberArrayInput() : (
            <textarea
              className="w-full px-2 py-1 rounded border text-xs font-mono resize-y min-h-[60px]"
              style={{
                borderColor: 'var(--te-border)',
                color: 'var(--te-text-primary)',
                backgroundColor: 'var(--te-bg-primary)',
              }}
              value={valueDraft}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                commitDraft();
              }}
              onChange={(e) => {
                setValueDraft(e.target.value);
                setDraftError(null);
                scheduleDraftCommit(e.target.value);
              }}
              spellCheck={false}
            />
          )}
          {draftError && (
            <div className="mt-0.5 text-xs" style={{ color: 'var(--te-error, #ef4444)' }}>
              {draftError}
            </div>
          )}
          {renderIssues()}
        </div>
      );
    }

    return (
      <div ref={isRoot ? undefined : containerRef} data-path={pathKey_} style={{ marginLeft: isRoot ? 0 : indent, ...(isCurrentMatch ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 12%, transparent)', borderRadius: 4 } : {}) }}>
        {!isRoot && (
          <div
            className="flex items-center gap-1 py-1 px-1 rounded group cursor-pointer hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {renderKey()}
            <span className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              [...] ({childCount})
            </span>
            {getTrailingCommentText(node) && (
              <span
                className="text-xs shrink-0"
                style={{ color: 'color-mix(in srgb, var(--te-text-secondary) 65%, transparent)' }}
              >
                {' '}// {getTrailingCommentText(node)}
              </span>
            )}
            {renderIssueBadge()}
            {renderActionButtons()}
          </div>
        )}
        {renderCommentEditor()}
        {expanded && (
          <div className={isRoot ? '' : 'ml-2 border-l pl-2'} style={isRoot ? {} : { borderColor: 'var(--te-border)' }}>
            {node.children.map((child, idx) => (
              <JsonFormField
                key={nodeKey(child)}
                node={child}
                pathKey={`[${idx}]`}
                issues={issues}
                onEdit={onEdit}
                onCopy={onCopy}
                onAddLike={onAddLike}
                onDelete={onDelete}
                onAdd={onAdd}
                onRename={onRename}
                onMove={onMove}
                onEditComment={onEditComment}
                onEditText={onEditText}
                depth={depth + 1}
              />
            ))}
            <button
              className="flex items-center gap-1 py-1 px-1 text-xs rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
              style={{ color: 'var(--te-text-secondary)' }}
              onClick={handleAddChild}
            >
              <Plus size={12} />
              添加元素
            </button>
            {renderIssues()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} data-path={pathKey_} style={{ marginLeft: indent, ...(isCurrentMatch ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 12%, transparent)', borderRadius: 4 } : {}) }}>
      <div
        className="flex items-center gap-2 py-1 px-1 rounded group hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
      >
        {renderKey()}
        <span className="text-xs shrink-0" style={{ color: 'var(--te-text-secondary)' }}>:</span>
        {renderValueInput()}
        {renderInlineTrailingComment()}
        {renderActionButtons()}
        {renderIssueBadge()}
      </div>
      {renderIssues()}
      {renderCommentEditor()}
    </div>
  );
});

const IconButton: React.FC<{
  title: string;
  onClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}> = ({ title, onClick, children }) => (
  <button
    className="flex items-center justify-center w-5 h-5 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
    style={{ color: 'var(--te-text-secondary)' }}
    onClick={onClick}
    title={title}
  >
    {children}
  </button>
);

function valueToDraft(node: JsonNodeInfo): string {
  if (node.type === 'array' && isSimpleArray(node.value)) {
    return JSON.stringify(node.value, null, 2);
  }
  if (node.type === 'number') return String(node.value ?? '');
  if (node.type === 'string') return String(node.value ?? '');
  return '';
}

const primaryActionStyle: React.CSSProperties = {
  backgroundColor: 'var(--te-primary)',
  color: '#ffffff',
  border: '1px solid color-mix(in srgb, var(--te-primary) 82%, #000000)',
};

function commentToggleStyle(active: boolean): React.CSSProperties {
  return active
    ? primaryActionStyle
    : {
        color: 'var(--te-text-secondary)',
        backgroundColor: 'transparent',
        border: '1px solid transparent',
      };
}

function getLeadingCommentText(node: JsonNodeInfo): string {
  return node.comments
    .filter((comment) => comment.position === 'leading')
    .map((comment) => comment.content)
    .join('\n');
}

function getTrailingCommentText(node: JsonNodeInfo): string {
  return node.comments
    .filter((comment) => comment.position === 'trailing')
    .map((comment) => comment.content)
    .join('\n');
}

function isCompactNumberArray(value: unknown, maxLen = 6): value is number[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maxLen &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item));
}


function pathsEqual(a: JSONPath, b: JSONPath): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

function isDescendantPath(path: JSONPath, parent: JSONPath): boolean {
  return path.length > parent.length && parent.every((segment, index) => segment === path[index]);
}

function nodeKey(node: JsonNodeInfo): string {
  return JSON.stringify(node.path);
}

export default JsonFormField;
JsonFormField.displayName = 'JsonFormField';
