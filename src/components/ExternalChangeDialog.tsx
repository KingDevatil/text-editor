import React, { useCallback } from 'react';
import { X, FileCheck, FileX, GitCompare } from 'lucide-react';
import DiffEditor from './DiffEditor';

interface ExternalChangeDialogProps {
  open: boolean;
  fileName: string;
  currentContent: string;
  externalContent: string;
  theme: string;
  onUseExternal: () => void;
  onKeepCurrent: () => void;
  onClose: () => void;
}

const ExternalChangeDialog: React.FC<ExternalChangeDialogProps> = ({
  open,
  fileName,
  currentContent,
  externalContent,
  theme,
  onUseExternal,
  onKeepCurrent,
  onClose,
}) => {
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="flex flex-col w-[90vw] h-[85vh] rounded-lg border shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--te-bg-primary)', borderColor: 'var(--te-border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderBottomColor: 'var(--te-border)', backgroundColor: 'var(--te-bg-secondary)' }}
        >
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--te-text-primary)' }}>
            <GitCompare size={16} />
            <span>外部变更：{fileName}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: 'var(--te-text-secondary)' }}
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Diff Editor */}
        <div className="flex-1 overflow-hidden">
          <DiffEditor
            leftContent={currentContent}
            rightContent={externalContent}
            theme={theme as import('../types').ThemeMode}
          />
        </div>

        {/* Footer Actions */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t"
          style={{ borderTopColor: 'var(--te-border)', backgroundColor: 'var(--te-bg-secondary)' }}
        >
          <button
            onClick={onKeepCurrent}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer hover:opacity-90"
            style={{ backgroundColor: 'var(--te-bg-tertiary)', color: 'var(--te-text-primary)', border: '1px solid var(--te-border)' }}
          >
            <FileX size={14} />
            保留当前编辑
          </button>
          <button
            onClick={onUseExternal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer hover:opacity-90"
            style={{ backgroundColor: 'var(--te-primary)', color: 'var(--te-primary-text)' }}
          >
            <FileCheck size={14} />
            使用外部版本
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ExternalChangeDialog);
