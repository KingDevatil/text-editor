import React from 'react';
import { Copy, CheckCircle2, AlertCircle } from 'lucide-react';

interface RegexPreviewProps {
  regex: string;
  explanation: string;
  isValid: boolean;
  error?: string;
}

export const RegexPreview: React.FC<RegexPreviewProps> = ({ regex, explanation, isValid, error }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!regex) return;
    navigator.clipboard.writeText(regex).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Regex display */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--te-text-secondary)]">
            生成的正则表达式
          </span>
          {regex && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] text-[var(--te-text-secondary)] hover:text-[var(--te-primary)] transition-colors"
            >
              {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>

        <div
          className="relative flex items-center gap-2 px-3 py-2.5 rounded-lg border font-mono text-sm"
          style={{
            backgroundColor: 'var(--te-bg-primary)',
            borderColor: isValid ? 'var(--te-border)' : 'var(--te-error)',
            borderLeftWidth: '2px',
            borderLeftColor: isValid ? (regex ? 'var(--te-success)' : 'var(--te-border)') : 'var(--te-error)',
            color: regex ? 'var(--te-text-primary)' : 'var(--te-text-secondary)',
          }}
        >
          <span className="flex-1 break-all">{regex || '/ 空 /'}</span>
          {!isValid && <AlertCircle size={14} className="text-[var(--te-error)] flex-shrink-0" />}
          {isValid && regex && <CheckCircle2 size={14} className="text-[var(--te-success)] flex-shrink-0" />}
        </div>
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--te-text-secondary)]">
            匹配说明
          </span>
          <p className="text-xs text-[var(--te-text-secondary)] leading-relaxed">{explanation}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--te-error)]">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
