import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FileType, ChevronUp, AlertCircle } from 'lucide-react';
import { forEachDiagnostic } from '@codemirror/lint';
import type { EditorTab, Encoding, Language } from '../types';
import { getEditorContent, getEditorLineCount, getEditorValueLength, getActiveView } from '../hooks/useEditorStatePool';

interface StatusBarProps {
  activeTab: EditorTab | null;
  theme: string;
  onEncodingChange?: (encoding: Encoding) => void;
  onLanguageChange?: (language: Language) => void;
  wordWrap?: boolean;
  onToggleWordWrap?: () => void;
  showWhitespace?: boolean;
  onToggleShowWhitespace?: () => void;
  minimapVisible?: boolean;
  onToggleMinimap?: () => void;
  diagnosticsPanelVisible?: boolean;
  onToggleDiagnosticsPanel?: () => void;
}

const ENCODINGS: Encoding[] = [
  'UTF-8',
  'UTF-8 BOM',
  'ANSI',
  'GBK',
  'GB2312',
  'GB18030',
  'BIG5',
  'Shift-JIS',
  'EUC-KR',
  'ISO-8859-1',
  'Windows-1252',
];

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'json', label: 'JSON' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
  { id: 'sql', label: 'SQL' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'ini', label: 'INI' },
  { id: 'log', label: 'Log' },
  { id: 'shell', label: 'Shell' },
];

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, onClose]);
}

function countWords(text: string): number {
  let count = 0;
  const lines = text.split('\n');
  const limit = Math.min(lines.length, 100000);
  for (let i = 0; i < limit; i++) {
    const matches = lines[i].match(/[\u4e00-\u9fa5]|[a-zA-Z]+|[0-9]+/g);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

const StatusBar: React.FC<StatusBarProps> = React.memo(({
  activeTab, onEncodingChange, onLanguageChange,
  wordWrap, onToggleWordWrap, showWhitespace, onToggleShowWhitespace,
  minimapVisible, onToggleMinimap,
  diagnosticsPanelVisible, onToggleDiagnosticsPanel,
}) => {
  const [wordCount, setWordCount] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [diagnosticCount, setDiagnosticCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const diagRef = useRef<number | null>(null);
  const lastContentRef = useRef('');

  // Quick stats from state pool — read directly so they update on every render
  const quickStats = useMemo(() => {
    if (!activeTab) return { lineCount: 0, charCount: 0 };
    return {
      lineCount: getEditorLineCount(activeTab.id),
      charCount: getEditorValueLength(activeTab.id),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeTab?.id, wordCount]); // wordCount changes on content edit, triggering re-calc

  // Async debounced word count via polling (CM6 has no model.onDidChangeContent)
  useEffect(() => {
    if (!activeTab) {
      queueMicrotask(() => {
        setWordCount(0);
        setCalculating(false);
      });
      return;
    }

    const poll = () => {
      const content = getEditorContent(activeTab.id);
      if (content !== lastContentRef.current) {
        lastContentRef.current = content;
        const isLarge = content.length > 500 * 1024;
        if (isLarge) setCalculating(true);

        // Defer heavy counting
        setTimeout(() => {
          setWordCount(countWords(content));
          setCalculating(false);
        }, isLarge ? 800 : 300);
      }
      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [activeTab?.id]);

  // Diagnostic count polling
  useEffect(() => {
    if (!activeTab) {
      setDiagnosticCount(0);
      return;
    }
    const poll = () => {
      const view = getActiveView(activeTab.id);
      if (!view) {
        setDiagnosticCount(0);
        return;
      }
      let count = 0;
      forEachDiagnostic(view.state, () => { count++; });
      setDiagnosticCount(count);
    };
    poll();
    diagRef.current = window.setInterval(poll, 500);
    return () => {
      if (diagRef.current !== null) {
        clearInterval(diagRef.current);
        diagRef.current = null;
      }
    };
  }, [activeTab?.id]);

  const [encOpen, setEncOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const encRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useClickOutside(encRef, () => setEncOpen(false));
  useClickOutside(langRef, () => setLangOpen(false));

  return (
    <div
      className="flex items-center justify-between px-3 h-7 text-xs select-none relative border-t"
      style={{ backgroundColor: 'var(--te-bg-secondary)', borderTopColor: 'var(--te-border)', color: 'var(--te-text-secondary)' }}
    >
      <div className="flex items-center gap-3">
        {activeTab && (
          <>
            <div className="relative" ref={langRef}>
              <button
                onClick={() => { setLangOpen(!langOpen); setEncOpen(false); }}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer hover:opacity-80"
                title="点击切换语言模式"
              >
                <FileType size={12} />
                <span className="font-medium">{activeTab.language.toUpperCase()}</span>
                <ChevronUp size={10} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
              </button>
              {langOpen && (
                <div
                  className="absolute bottom-full left-0 mb-1 py-1.5 rounded-lg shadow-xl border z-50 min-w-[150px] max-h-64 overflow-auto"
                  style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)' }}
                >
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => { onLanguageChange?.(lang.id); setLangOpen(false); }}
                      className={`block w-full text-left px-3 py-1.5 text-xs rounded transition-colors hover:opacity-80 ${activeTab.language === lang.id ? 'font-medium' : ''}`}
                      style={activeTab.language === lang.id
                        ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                        : { color: 'var(--te-text-primary)' }
                      }
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: activeTab.isDirty ? 'var(--te-warning)' : 'var(--te-success)',
                color: 'var(--te-text-primary)',
              }}
            >
              {activeTab.isDirty ? '已修改' : '已保存'}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {activeTab && (
          <>
            <span className="tabular-nums">行 {quickStats.lineCount}</span>
            <span className="tabular-nums">字符 {quickStats.charCount}</span>
            <span className="tabular-nums">字数 {calculating ? '...' : wordCount.toLocaleString()}</span>
          </>
        )}
        {activeTab && (
          <>
            <button
              onClick={onToggleWordWrap}
              className="px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[10px] font-medium hover:opacity-80"
              style={wordWrap
                ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                : { color: 'var(--te-text-secondary)' }
              }
              title="自动换行"
            >
              换行
            </button>
            <button
              onClick={onToggleShowWhitespace}
              className="px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[10px] font-medium hover:opacity-80"
              style={showWhitespace
                ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                : { color: 'var(--te-text-secondary)' }
              }
              title="显示空白字符"
            >
              空白
            </button>
            <button
              onClick={onToggleMinimap}
              className="px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[10px] font-medium hover:opacity-80"
              style={minimapVisible
                ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                : { color: 'var(--te-text-secondary)' }
              }
              title="代码缩略图"
            >
              缩略图
            </button>
            {onToggleDiagnosticsPanel && (
              <button
                onClick={onToggleDiagnosticsPanel}
                className="px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[10px] font-medium hover:opacity-80 flex items-center gap-1"
                style={diagnosticsPanelVisible
                  ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                  : diagnosticCount > 0
                    ? { color: 'var(--te-error, #ef4444)' }
                    : { color: 'var(--te-text-secondary)' }
                }
                title="问题面板"
              >
                <AlertCircle size={10} />
                {diagnosticCount > 0 ? `${diagnosticCount} 个问题` : '无问题'}
              </button>
            )}
          </>
        )}
        <div className="relative" ref={encRef}>
          <button
            onClick={() => { setEncOpen(!encOpen); setLangOpen(false); }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer hover:opacity-80"
            title="点击切换编码"
          >
            <span className="font-medium">{activeTab?.encoding || 'UTF-8'}</span>
            <ChevronUp size={10} className={`transition-transform ${encOpen ? 'rotate-180' : ''}`} />
          </button>
          {encOpen && (
            <div
              className="absolute bottom-full right-0 mb-1 py-1.5 rounded-lg shadow-xl border z-50 min-w-[150px]"
              style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)' }}
            >
              {ENCODINGS.map((enc) => (
                <button
                  key={enc}
                  onClick={() => { onEncodingChange?.(enc); setEncOpen(false); }}
                  className={`block w-full text-left px-3 py-1.5 text-xs rounded transition-colors hover:opacity-80 ${activeTab?.encoding === enc ? 'font-medium' : ''}`}
                  style={activeTab?.encoding === enc
                    ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                    : { color: 'var(--te-text-primary)' }
                  }
                >
                  {enc}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default StatusBar;
StatusBar.displayName = 'StatusBar';
