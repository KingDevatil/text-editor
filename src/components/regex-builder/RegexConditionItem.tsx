import React, { useState } from 'react';
import { X, GripVertical, ChevronDown } from 'lucide-react';
import type { RegexCondition, RegexQuantifier } from '../../types';
import { CONDITION_CONFIGS, QUANTIFIER_LABELS } from '../../utils/regexBuilder';

interface RegexConditionItemProps {
  condition: RegexCondition;
  index: number;
  isEditing: boolean;
  onUpdate: (updated: RegexCondition) => void;
  onDelete: () => void;
  onToggleEdit: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const QUANTIFIER_OPTIONS: { value: RegexQuantifier; label: string }[] = [
  { value: 'exactly-one', label: '恰好 1 个' },
  { value: 'zero-or-one', label: '可能出现' },
  { value: 'zero-or-more', label: '任意数量' },
  { value: 'one-or-more', label: '至少 1 个' },
  { value: 'exactly-n', label: '恰好 N 个' },
  { value: 'range', label: 'N 到 M 个' },
  { value: 'at-least-n', label: '至少 N 个' },
];

export const RegexConditionItem: React.FC<RegexConditionItemProps> = ({
  condition,
  index,
  isEditing,
  onUpdate,
  onDelete,
  onToggleEdit,
  dragHandleProps,
}) => {
  const [localValue, setLocalValue] = useState(condition.value || '');
  const [localQuantifier, setLocalQuantifier] = useState<RegexQuantifier>(condition.quantifier);
  const [localQuantifierValue, setLocalQuantifierValue] = useState(condition.quantifierValue || { n: 1, m: 1 });
  const [localCapture, setLocalCapture] = useState(condition.capture !== false);

  const config = CONDITION_CONFIGS[condition.type];
  const quantifierLabel = QUANTIFIER_LABELS[condition.quantifier];

  const handleSave = () => {
    onUpdate({
      ...condition,
      value: localValue,
      quantifier: localQuantifier,
      quantifierValue: localQuantifierValue,
      capture: condition.type === 'group' ? localCapture : undefined,
    });
    onToggleEdit();
  };

  const handleCancel = () => {
    setLocalValue(condition.value || '');
    setLocalQuantifier(condition.quantifier);
    setLocalQuantifierValue(condition.quantifierValue || { n: 1, m: 1 });
    setLocalCapture(condition.capture !== false);
    onToggleEdit();
  };

  const showQuantifierValue = localQuantifier === 'exactly-n' || localQuantifier === 'at-least-n' || localQuantifier === 'range';

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-lg border transition-all duration-150"
      style={{
        backgroundColor: isEditing
          ? 'color-mix(in srgb, var(--te-primary) 5%, var(--te-bg-secondary))'
          : 'var(--te-bg-secondary)',
        borderColor: isEditing ? 'var(--te-primary)' : 'var(--te-border)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-[var(--te-text-secondary)] hover:text-[var(--te-text-primary)]"
          >
            <GripVertical size={14} />
          </div>
        )}
        <span className="text-xs font-mono text-[var(--te-text-secondary)] min-w-[20px]">{index + 1}.</span>

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-[var(--te-text-primary)]">{config.label}</span>
          {condition.value && (
            <span className="text-sm font-mono text-[var(--te-primary)] truncate">"{condition.value}"</span>
          )}
          {quantifierLabel.symbol && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--te-bg-primary)] text-[var(--te-text-secondary)] border border-[var(--te-border)]">
              {quantifierLabel.symbol}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleEdit}
            className="p-1 rounded-md text-[var(--te-text-secondary)] hover:text-[var(--te-text-primary)] hover:bg-[var(--te-bg-primary)] transition-colors"
            title={isEditing ? '收起' : '编辑'}
          >
            <ChevronDown
              size={14}
              className={`transition-transform duration-150 ${isEditing ? 'rotate-180' : ''}`}
            />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded-md text-[var(--te-text-secondary)] hover:text-[var(--te-error)] hover:bg-[color-mix(in_srgb,var(--te-error)_8%,transparent)] transition-colors"
            title="删除"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="flex flex-col gap-3 mt-1 p-3 rounded-md border border-[var(--te-border)] bg-[var(--te-bg-primary)]">
          {/* Value input */}
          {config.hasValue && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--te-text-secondary)]">内容</label>
              <input
                type="text"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                className="px-2.5 py-1.5 text-sm rounded-md border bg-[var(--te-bg-secondary)] text-[var(--te-text-primary)] placeholder-[var(--te-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--te-primary)_40%,transparent)] focus:border-[var(--te-primary)] transition-all"
                style={{ borderColor: 'var(--te-border)' }}
                placeholder="输入匹配内容..."
                autoFocus
              />
            </div>
          )}

          {/* Quantifier selector */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--te-text-secondary)]">数量</label>
            <select
              value={localQuantifier}
              onChange={(e) => setLocalQuantifier(e.target.value as RegexQuantifier)}
              className="px-2.5 py-1.5 text-sm rounded-md border bg-[var(--te-bg-secondary)] text-[var(--te-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--te-primary)_40%,transparent)] focus:border-[var(--te-primary)] transition-all cursor-pointer"
              style={{ borderColor: 'var(--te-border)' }}
            >
              {QUANTIFIER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Quantifier value inputs */}
          {showQuantifierValue && (
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--te-text-secondary)]">N</label>
                <input
                  type="number"
                  min={0}
                  value={localQuantifierValue.n || 0}
                  onChange={(e) => setLocalQuantifierValue({ ...localQuantifierValue, n: parseInt(e.target.value) || 0 })}
                  className="w-16 px-2 py-1 text-sm rounded-md border bg-[var(--te-bg-secondary)] text-[var(--te-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--te-primary)_40%,transparent)] focus:border-[var(--te-primary)] transition-all"
                  style={{ borderColor: 'var(--te-border)' }}
                />
              </div>
              {localQuantifier === 'range' && (
                <>
                  <span className="text-[var(--te-text-secondary)] mt-5">-</span>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[var(--te-text-secondary)]">M</label>
                    <input
                      type="number"
                      min={0}
                      value={localQuantifierValue.m || 0}
                      onChange={(e) => setLocalQuantifierValue({ ...localQuantifierValue, m: parseInt(e.target.value) || 0 })}
                      className="w-16 px-2 py-1 text-sm rounded-md border bg-[var(--te-bg-secondary)] text-[var(--te-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--te-primary)_40%,transparent)] focus:border-[var(--te-primary)] transition-all"
                      style={{ borderColor: 'var(--te-border)' }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Capture option for groups */}
          {condition.type === 'group' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={localCapture}
                onChange={(e) => setLocalCapture(e.target.checked)}
                className="rounded border-[var(--te-border)] text-[var(--te-primary)] focus:ring-[var(--te-primary)]"
              />
              <span className="text-sm text-[var(--te-text-primary)]">捕获此分组</span>
            </label>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 mt-1">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs rounded-lg text-[var(--te-text-secondary)] hover:text-[var(--te-text-primary)] hover:bg-[var(--te-bg-secondary)] transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs rounded-lg font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--te-primary)' }}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
