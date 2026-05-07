import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Wand2, Trash2, Check } from 'lucide-react';
import type { RegexCondition, RegexConditionType } from '../types';
import {
  buildRegex,
  explainRegex,
  createCondition,
  generateConditionId,
  REGEX_TEMPLATES,
} from '../utils/regexBuilder';
import { RegexToolbar } from './regex-builder/RegexToolbar';
import { RegexConditionItem } from './regex-builder/RegexConditionItem';
import { RegexPreview } from './regex-builder/RegexPreview';
import { TestPanel } from './regex-builder/TestPanel';

interface RegexBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (regex: string) => void;
  initialValue?: string;
}

export const RegexBuilderModal: React.FC<RegexBuilderModalProps> = ({
  open,
  onClose,
  onConfirm,
  initialValue,
}) => {
  const [conditions, setConditions] = useState<RegexCondition[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const prevOpenRef = React.useRef(false);

  // Reset state when modal opens (transition from closed to open)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      // TODO: Try to parse initialValue into conditions if it's a valid regex
      queueMicrotask(() => {
        setConditions([]);
        setEditingId(null);
        setTemplateMenuOpen(false);
      });
    }
    prevOpenRef.current = open;
  }, [open, initialValue]);

  const { regex, isValid, error } = useMemo(() => buildRegex(conditions), [conditions]);
  const explanation = useMemo(() => explainRegex(conditions), [conditions]);

  const handleAddCondition = useCallback((type: RegexConditionType) => {
    const newCondition = createCondition(type);
    setConditions((prev) => [...prev, newCondition]);
    setEditingId(newCondition.id);
  }, []);

  const handleUpdateCondition = useCallback((updated: RegexCondition) => {
    setConditions((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const handleDeleteCondition = useCallback((id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) setEditingId(null);
  }, [editingId]);

  const handleToggleEdit = useCallback((id: string) => {
    setEditingId((prev) => (prev === id ? null : id));
  }, []);

  const handleClearAll = useCallback(() => {
    setConditions([]);
    setEditingId(null);
  }, []);

  const handleApplyTemplate = useCallback((templateIndex: number) => {
    const template = REGEX_TEMPLATES[templateIndex];
    if (!template) return;
    const cloned = template.conditions.map((c) => ({ ...c, id: generateConditionId() }));
    setConditions(cloned);
    setTemplateMenuOpen(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (isValid && regex) {
      onConfirm(regex);
      onClose();
    }
  }, [isValid, regex, onConfirm, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleConfirm();
      }
    },
    [onClose, handleConfirm]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-[720px] max-w-[95vw] max-h-[90vh] flex flex-col rounded-xl shadow-2xl border overflow-hidden"
        style={{
          backgroundColor: 'var(--te-bg-tertiary)',
          borderColor: 'var(--te-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--te-border)' }}
        >
          <div className="flex items-center gap-2">
            <Wand2 size={16} className="text-[var(--te-primary)]" />
            <h2 className="text-base font-semibold" style={{ color: 'var(--te-text-primary)' }}>
              可视化正则构建器
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:opacity-70 transition-opacity"
            style={{ color: 'var(--te-text-secondary)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Builder area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--te-border)' }}>
              <RegexToolbar onAddCondition={handleAddCondition} />
            </div>

            {/* Conditions list */}
            <div className="flex-1 overflow-auto p-4">
              {conditions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--te-text-secondary)]">
                  <Wand2 size={32} className="opacity-30" />
                  <p className="text-sm">点击上方按钮添加匹配条件</p>
                  <p className="text-xs opacity-60">从左侧工具栏选择条件类型开始构建</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {conditions.map((condition, index) => (
                    <RegexConditionItem
                      key={condition.id}
                      condition={condition}
                      index={index}
                      isEditing={editingId === condition.id}
                      onUpdate={handleUpdateCondition}
                      onDelete={() => handleDeleteCondition(condition.id)}
                      onToggleEdit={() => handleToggleEdit(condition.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div
              className="flex items-center justify-between px-4 py-2.5 border-t gap-2"
              style={{ borderColor: 'var(--te-border)' }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClearAll}
                  disabled={conditions.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors border disabled:opacity-40"
                  style={{
                    borderColor: 'var(--te-border)',
                    color: conditions.length > 0 ? 'var(--te-error)' : 'var(--te-text-secondary)',
                  }}
                >
                  <Trash2 size={12} />
                  清空
                </button>

                {/* Template dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors border"
                    style={{
                      borderColor: 'var(--te-border)',
                      color: 'var(--te-text-primary)',
                      backgroundColor: templateMenuOpen
                        ? 'color-mix(in srgb, var(--te-primary) 8%, transparent)'
                        : 'transparent',
                    }}
                  >
                    <Wand2 size={12} />
                    模板
                  </button>

                  {templateMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[90]"
                        onClick={() => setTemplateMenuOpen(false)}
                      />
                      <div
                        className="absolute bottom-full left-0 mb-1 w-48 py-1 rounded-lg border shadow-lg z-[100] overflow-hidden"
                        style={{
                          backgroundColor: 'var(--te-bg-tertiary)',
                          borderColor: 'var(--te-border)',
                        }}
                      >
                        {REGEX_TEMPLATES.map((template, index) => (
                          <button
                            key={template.name}
                            onClick={() => handleApplyTemplate(index)}
                            className="w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--te-bg-secondary)]"
                            style={{ color: 'var(--te-text-primary)' }}
                          >
                            <div className="font-medium">{template.name}</div>
                            <div className="text-[10px] text-[var(--te-text-secondary)] mt-0.5">{template.description}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--te-text-secondary)]">Ctrl+Enter 确认 · Esc 关闭</span>
              </div>
            </div>
          </div>

          {/* Right: Preview + Test */}
          <div
            className="w-[320px] flex flex-col gap-4 p-4 border-l overflow-auto"
            style={{
              borderColor: 'var(--te-border)',
              backgroundColor: 'color-mix(in srgb, var(--te-bg-secondary) 50%, var(--te-bg-tertiary))',
            }}
          >
            <RegexPreview
              regex={regex}
              explanation={explanation}
              isValid={isValid}
              error={error}
            />

            <div className="border-t" style={{ borderColor: 'var(--te-border)' }} />

            <TestPanel regex={regex} isValid={isValid} />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'var(--te-border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs rounded-lg transition-colors"
            style={{
              color: 'var(--te-text-primary)',
              backgroundColor: 'var(--te-bg-secondary)',
              border: '1px solid var(--te-border)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid || !regex}
            className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg font-medium text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: 'var(--te-primary)' }}
          >
            <Check size={14} />
            确认并使用
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(RegexBuilderModal);
