import React from 'react';
import {
  Type,
  Hash,
  CaseSensitive,
  WholeWord,
  Space,
  Asterisk,
  AlignLeft,
  AlignRight,
  BetweenHorizontalStart,
  Brackets,
  Parentheses,
  GitBranch,
} from 'lucide-react';
import type { RegexConditionType } from '../../types';
import { CONDITION_CONFIGS } from '../../utils/regexBuilder';

const ICON_MAP: Record<string, React.ReactNode> = {
  Type: <Type size={14} />,
  Hash: <Hash size={14} />,
  CaseSensitive: <CaseSensitive size={14} />,
  WholeWord: <WholeWord size={14} />,
  Space: <Space size={14} />,
  Asterisk: <Asterisk size={14} />,
  AlignLeft: <AlignLeft size={14} />,
  AlignRight: <AlignRight size={14} />,
  BetweenHorizontalStart: <BetweenHorizontalStart size={14} />,
  Brackets: <Brackets size={14} />,
  Parentheses: <Parentheses size={14} />,
  GitBranch: <GitBranch size={14} />,
};

interface RegexToolbarProps {
  onAddCondition: (type: RegexConditionType) => void;
}

const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'text', label: '文本' },
  { key: 'char', label: '字符' },
  { key: 'position', label: '位置' },
  { key: 'logic', label: '逻辑' },
];

export const RegexToolbar: React.FC<RegexToolbarProps> = ({ onAddCondition }) => {
  const grouped = React.useMemo(() => {
    const groups: Record<string, { type: RegexConditionType; config: typeof CONDITION_CONFIGS[RegexConditionType] }[]> = {};
    for (const [type, config] of Object.entries(CONDITION_CONFIGS)) {
      if (!groups[config.category]) groups[config.category] = [];
      groups[config.category].push({ type: type as RegexConditionType, config });
    }
    return groups;
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped[cat.key];
        if (!items || items.length === 0) return null;
        return (
          <div key={cat.key} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--te-text-secondary)' }}>
              {cat.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {items.map(({ type, config }) => (
                <button
                  key={type}
                  onClick={() => onAddCondition(type)}
                  title={`${config.label} - ${config.description}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all duration-100 hover:scale-[1.02] active:scale-95"
                  style={{
                    backgroundColor: 'var(--te-bg-secondary)',
                    borderColor: 'var(--te-border)',
                    color: 'var(--te-text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--te-bg-primary)';
                    e.currentTarget.style.color = 'var(--te-text-primary)';
                    e.currentTarget.style.borderColor = 'var(--te-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--te-bg-secondary)';
                    e.currentTarget.style.color = 'var(--te-text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--te-border)';
                  }}
                >
                  {ICON_MAP[config.icon] || <Type size={14} />}
                  <span>{config.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
