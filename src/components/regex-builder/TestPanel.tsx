import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface TestPanelProps {
  regex: string;
  isValid: boolean;
}

export const TestPanel: React.FC<TestPanelProps> = ({ regex, isValid }) => {
  const [testText, setTestText] = useState('');

  const { matches, highlights } = React.useMemo(() => {
    if (!regex || !isValid || !testText) {
      return { matches: 0, highlights: [] as { start: number; end: number; text: string }[] };
    }

    try {
      const re = new RegExp(regex, 'g');
      const results: { start: number; end: number; text: string }[] = [];
      let match;
      while ((match = re.exec(testText)) !== null) {
        results.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
        if (match.index === re.lastIndex) re.lastIndex++;
      }
      return { matches: results.length, highlights: results };
    } catch {
      return { matches: 0, highlights: [] as { start: number; end: number; text: string }[] };
    }
  }, [regex, isValid, testText]);

  const renderHighlightedText = () => {
    if (highlights.length === 0) {
      return <span className="text-[var(--te-text-primary)]">{testText}</span>;
    }

    const parts: React.ReactNode[] = [];
    let lastEnd = 0;

    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      if (h.start > lastEnd) {
        parts.push(
          <span key={`text_${i}`} className="text-[var(--te-text-primary)]">
            {testText.slice(lastEnd, h.start)}
          </span>
        );
      }
      parts.push(
        <mark
          key={`match_${i}`}
          className="rounded px-0.5 font-medium"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--te-primary) 22%, transparent)',
            color: 'var(--te-text-primary)',
          }}
        >
          {h.text}
        </mark>
      );
      lastEnd = h.end;
    }

    if (lastEnd < testText.length) {
      parts.push(
        <span key="text_end" className="text-[var(--te-text-primary)]">{testText.slice(lastEnd)}</span>
      );
    }

    return parts;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--te-text-secondary)]">
          测试文本
        </span>
        {isValid && regex && (
          <span className="text-[10px] text-[var(--te-text-secondary)]">
            匹配到 <span className="font-medium text-[var(--te-primary)]">{matches}</span> 处
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="在此输入文本进行测试..."
          className="w-full h-24 px-3 py-2 text-sm rounded-lg border resize-none bg-[var(--te-bg-primary)] text-[var(--te-text-primary)] placeholder-[var(--te-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--te-primary)_40%,transparent)] focus:border-[var(--te-primary)] transition-all"
          style={{ borderColor: 'var(--te-border)' }}
        />

        {/* Result display */}
        {testText && (
          <div
            className="w-full min-h-[60px] max-h-32 px-3 py-2 text-sm rounded-lg border overflow-auto whitespace-pre-wrap break-all font-mono"
            style={{
              backgroundColor: 'var(--te-bg-primary)',
              borderColor: 'var(--te-border)',
            }}
          >
            {isValid ? (
              renderHighlightedText()
            ) : (
              <span className="flex items-center gap-1 text-[var(--te-error)]">
                <AlertCircle size={12} />
                正则表达式无效，无法测试
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
