import React, { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Copy, Trash2, Plus, Maximize2 } from 'lucide-react';
import type { JsonNodeInfo, JSONPath } from '../utils/jsoncParser';
import { isSimpleArray } from '../utils/jsoncParser';

interface JsonFormFieldProps {
  node: JsonNodeInfo;
  pathKey: string;
  onEdit: (path: JSONPath, newValue: unknown) => void;
  onCopy: (parentPath: JSONPath, sourceKey: string | number, isObject: boolean) => void;
  onDelete: (path: JSONPath) => void;
  onAdd: (parentPath: JSONPath, isObject: boolean) => void;
  onEditText: (path: JSONPath, value: string) => void;
  depth: number;
  isRoot?: boolean;
}

const JsonFormField: React.FC<JsonFormFieldProps> = React.memo(({
  node, pathKey, onEdit, onCopy, onDelete, onAdd, onEditText, depth, isRoot = false,
}) => {
  const [expanded, setExpanded] = useState(depth < 4);

  const indent = depth * 16;

  const handleValueChange = useCallback((newValue: unknown) => {
    onEdit(node.path, newValue);
  }, [node.path, onEdit]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.path.length === 0) return;
    const parentPath = node.path.slice(0, -1);
    const sourceKey = node.path[node.path.length - 1];
    const isObj = node.type === 'object';
    onCopy(parentPath, sourceKey, isObj);
  }, [node, onCopy]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(node.path);
  }, [node.path, onDelete]);

  const handleAddChild = useCallback(() => {
    if (node.type === 'object') {
      onAdd(node.path, true);
    } else if (node.type === 'array') {
      onAdd(node.path, false);
    }
  }, [node, onAdd]);

  const renderValueInput = () => {
    switch (node.type) {
      case 'string': {
        const strVal = String(node.value ?? '');
        if (strVal.length > 80) {
          return (
            <button
              className="text-left px-2 py-0.5 rounded border text-xs truncate max-w-[200px]"
              style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)', backgroundColor: 'var(--te-bg-primary)' }}
              onClick={() => onEditText(node.path, strVal)}
              title="点击编辑长文本"
            >
              {strVal.substring(0, 60)}...
              <Maximize2 size={10} className="inline ml-1 opacity-50" />
            </button>
          );
        }
        return (
          <input
            type="text"
            className="flex-1 min-w-0 px-2 py-0.5 rounded border text-xs"
            style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)', backgroundColor: 'var(--te-bg-primary)' }}
            value={strVal}
            onChange={(e) => handleValueChange(e.target.value)}
          />
        );
      }
      case 'number':
        return (
          <input
            type="number"
            className="w-32 px-2 py-0.5 rounded border text-xs"
            style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)', backgroundColor: 'var(--te-bg-primary)' }}
            value={node.value as number}
            onChange={(e) => handleValueChange(Number(e.target.value))}
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

  const renderActionButtons = () => (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {!isRoot && (
        <>
          <button
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-[color-mix(in_srgb,var(--te-text-primary)_8%,transparent)]"
            style={{ color: 'var(--te-text-secondary)' }}
            onClick={handleCopy}
            title="复制"
          >
            <Copy size={12} />
          </button>
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

  if (node.type === 'object') {
    const childCount = node.children.length;
    return (
      <div style={{ marginLeft: isRoot ? 0 : indent }}>
        {!isRoot && (
          <div
            className="flex items-center gap-1 py-1 px-1 rounded group cursor-pointer hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: 'var(--te-primary)' }}>
              {typeof node.key === 'string' ? node.key : pathKey}
            </span>
            <span className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              {'{'}...{'}'} ({childCount})
            </span>
            {renderActionButtons()}
          </div>
        )}
        {expanded && (
          <div className={isRoot ? '' : 'ml-2 border-l pl-2'} style={isRoot ? {} : { borderColor: 'var(--te-border)' }}>
            {node.children.map((child) => (
              <JsonFormField
                key={child.path.join('.')}
                node={child}
                pathKey={String(child.key ?? '')}
                onEdit={onEdit}
                onCopy={onCopy}
                onDelete={onDelete}
                onAdd={onAdd}
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
          </div>
        )}
      </div>
    );
  }

  if (node.type === 'array') {
    const childCount = node.children.length;
    const simple = isSimpleArray(node.value);

    if (simple) {
      const arrayText = JSON.stringify(node.value, null, 2);
      return (
        <div style={{ marginLeft: isRoot ? 0 : indent }} className="py-1">
          {!isRoot && (
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs font-medium" style={{ color: 'var(--te-primary)' }}>
                {typeof node.key === 'string' ? node.key : pathKey}
              </span>
              <span className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
                [简单数组] ({childCount})
              </span>
              {renderActionButtons()}
            </div>
          )}
          <textarea
            className="w-full px-2 py-1 rounded border text-xs font-mono resize-y min-h-[60px]"
            style={{ borderColor: 'var(--te-border)', color: 'var(--te-text-primary)', backgroundColor: 'var(--te-bg-primary)' }}
            value={arrayText}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                if (Array.isArray(parsed)) {
                  handleValueChange(parsed);
                }
              } catch {
                // 用户还在编辑中，不更新
              }
            }}
            spellCheck={false}
          />
        </div>
      );
    }

    return (
      <div style={{ marginLeft: isRoot ? 0 : indent }}>
        {!isRoot && (
          <div
            className="flex items-center gap-1 py-1 px-1 rounded group cursor-pointer hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: 'var(--te-primary)' }}>
              {typeof node.key === 'string' ? node.key : pathKey}
            </span>
            <span className="text-xs" style={{ color: 'var(--te-text-secondary)' }}>
              [{'...'}] ({childCount})
            </span>
            {renderActionButtons()}
          </div>
        )}
        {expanded && (
          <div className={isRoot ? '' : 'ml-2 border-l pl-2'} style={isRoot ? {} : { borderColor: 'var(--te-border)' }}>
            {node.children.map((child, idx) => (
              <JsonFormField
                key={child.path.join('.')}
                node={child}
                pathKey={`[${idx}]`}
                onEdit={onEdit}
                onCopy={onCopy}
                onDelete={onDelete}
                onAdd={onAdd}
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 py-1 px-1 rounded group hover:bg-[color-mix(in_srgb,var(--te-text-primary)_4%,transparent)]"
      style={{ marginLeft: indent }}
    >
      <span className="text-xs font-medium shrink-0" style={{ color: 'var(--te-primary)' }}>
        {typeof node.key === 'string' ? node.key : pathKey}
      </span>
      <span className="text-xs shrink-0" style={{ color: 'var(--te-text-secondary)' }}>:</span>
      {renderValueInput()}
      {renderActionButtons()}
    </div>
  );
});

export default JsonFormField;
JsonFormField.displayName = 'JsonFormField';
