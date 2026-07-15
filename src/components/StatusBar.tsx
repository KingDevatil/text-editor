import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FileType, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react';
import { forEachDiagnostic } from '@codemirror/lint';
import type { EditorTab, Encoding, Language, LineEnding } from '../types';
import {
  getActiveView,
  getEditorLineCount,
  getEditorState,
  getEditorValueLength,
  subscribeDocumentChange,
  subscribeEditorUpdate,
} from '../hooks/useEditorStatePool';

interface StatusBarProps {
  activeTab: EditorTab | null;
  theme: string;
  onEncodingChange?: (encoding: Encoding) => void;
  onLanguageChange?: (language: Language) => void;
  lineEnding?: LineEnding;
  onLineEndingChange?: (lineEnding: LineEnding) => void;
  wordWrap?: boolean;
  onToggleWordWrap?: () => void;
  showWhitespace?: boolean;
  onToggleShowWhitespace?: () => void;
  minimapVisible?: boolean;
  onToggleMinimap?: () => void;
  diagnosticsPanelVisible?: boolean;
  onToggleDiagnosticsPanel?: () => void;
  columnAlignEnabled?: boolean;
  onToggleColumnAlign?: () => void;
  columnAlignSupported?: boolean;
  externalChangeNotice?: string | null;
}

const ENCODINGS: Encoding[] = [
  'UTF-8',
  'UTF-8 BOM',
  'UTF-16LE',
  'UTF-16BE',
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

const LINE_ENDINGS: LineEnding[] = ['CRLF', 'LF', 'CR'];

const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'json', label: 'JSON' },
  { id: 'jsonl', label: 'JSON Lines' },
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

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, onClose, enabled]);
}

const WORD_COUNT_LINE_LIMIT = 100000;
const WORD_COUNT_CHUNK_LINES = 2000;

function scheduleWordCount(tabId: string, onDone: (count: number) => void): () => void {
  const doc = getEditorState(tabId)?.doc;
  if (!doc) {
    onDone(0);
    return () => {};
  }

  let cancelled = false;
  let nextLine = 1;
  let count = 0;
  let timer: number | null = null;
  const limit = Math.min(doc.lines, WORD_COUNT_LINE_LIMIT);

  const step = () => {
    if (cancelled) return;
    const end = Math.min(limit, nextLine + WORD_COUNT_CHUNK_LINES - 1);
    for (; nextLine <= end; nextLine += 1) {
      const matches = doc.line(nextLine).text.match(/[\u4e00-\u9fa5]|[a-zA-Z]+|[0-9]+/g);
      if (matches) count += matches.length;
    }
    if (nextLine <= limit) {
      timer = window.setTimeout(step, 0);
    } else {
      onDone(count);
    }
  };

  timer = window.setTimeout(step, 0);
  return () => {
    cancelled = true;
    if (timer !== null) window.clearTimeout(timer);
  };
}

const StatusBar: React.FC<StatusBarProps> = React.memo(({
  activeTab, onEncodingChange, onLanguageChange,
  lineEnding, onLineEndingChange,
  wordWrap, onToggleWordWrap, showWhitespace, onToggleShowWhitespace,
  minimapVisible, onToggleMinimap,
  diagnosticsPanelVisible, onToggleDiagnosticsPanel,
  columnAlignEnabled, onToggleColumnAlign,
  columnAlignSupported,
  externalChangeNotice,
}) => {
  const [wordCount, setWordCount] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [diagnosticCount, setDiagnosticCount] = useState(0);
  const [contentVersion, setContentVersion] = useState(0);

  // Quick stats from state pool — read directly so they update on every render
  const quickStats = useMemo(() => {
    if (!activeTab) return { lineCount: 0, charCount: 0 };
    return {
      lineCount: getEditorLineCount(activeTab.id),
      charCount: getEditorValueLength(activeTab.id),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeTab?.id, contentVersion]);

  // Event-driven word count without materializing the whole document string.
  useEffect(() => {
    if (!activeTab) {
      queueMicrotask(() => {
        setWordCount(0);
        setCalculating(false);
      });
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelCount: (() => void) | null = null;

    const unsubscribe = subscribeDocumentChange(activeTab.id, () => {
      setContentVersion((v) => v + 1);
      if (timeoutId) clearTimeout(timeoutId);
      cancelCount?.();
      const isLarge = getEditorValueLength(activeTab.id) > 2 * 1024 * 1024;
      if (isLarge) setCalculating(true);
      timeoutId = setTimeout(() => {
        cancelCount = scheduleWordCount(activeTab.id, (count) => {
          setWordCount(count);
          setCalculating(false);
        });
      }, isLarge ? 800 : 300);
    });

    return () => {
      unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
      cancelCount?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id]);

  // Diagnostic count follows editor updates instead of polling in the background.
  useEffect(() => {
    if (!activeTab) {
      queueMicrotask(() => setDiagnosticCount(0));
      return;
    }
    const poll = () => {
      const view = getActiveView(activeTab.id);
      if (!view) {
        setDiagnosticCount(0);
        return;
      }
      let count = 0;
      forEachDiagnostic(view.state, (d) => {
        if (d.severity !== 'info') count++;
      });
      setDiagnosticCount(count);
    };
    let frame: number | null = null;
    const schedulePoll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        poll();
      });
    };
    const unsubscribe = subscribeEditorUpdate(activeTab.id, schedulePoll);
    return () => {
      unsubscribe();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id]);

  const [encOpen, setEncOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [leOpen, setLeOpen] = useState(false);
  const encRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const leRef = useRef<HTMLDivElement>(null);

  useClickOutside(encRef, () => setEncOpen(false), encOpen);
  useClickOutside(langRef, () => setLangOpen(false), langOpen);
  useClickOutside(leRef, () => setLeOpen(false), leOpen);
  const loadState = activeTab?.loadState ?? 'ready';
  const controlsDisabled = loadState !== 'ready';

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
                onClick={() => { setLangOpen(!langOpen); setEncOpen(false); setLeOpen(false); }}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:opacity-80 ${controlsDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                title={controlsDisabled ? '文件完整加载后可切换语言模式' : '点击切换语言模式'}
                disabled={controlsDisabled}
              >
                <FileType size={12} />
                <span className="font-medium">{activeTab.language.toUpperCase()}</span>
                <ChevronUp size={10} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
              </button>
              {langOpen && !controlsDisabled && (
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
                backgroundColor: loadState === 'error'
                  ? 'var(--te-error)'
                  : loadState === 'loading'
                    ? 'var(--te-primary)'
                    : activeTab.isDirty
                      ? 'var(--te-warning)'
                      : 'var(--te-success)',
                color: 'var(--te-text-primary)',
              }}
            >
              {loadState === 'error' ? '加载失败' : loadState === 'loading' ? '正在加载' : activeTab.isDirty ? '已修改' : '已保存'}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {externalChangeNotice && (
          <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--te-success)' }}>
            <RefreshCw size={10} />
            {externalChangeNotice}
          </span>
        )}
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
            {columnAlignSupported && onToggleColumnAlign && (
              <button
                onClick={onToggleColumnAlign}
                className="px-1.5 py-0.5 rounded transition-colors cursor-pointer text-[10px] font-medium hover:opacity-80"
                style={columnAlignEnabled
                  ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                  : { color: 'var(--te-text-secondary)' }
                }
                title="列对齐"
              >
                列对齐
              </button>
            )}
          </>
        )}
        <div className="relative" ref={leRef}>
          <button
          onClick={() => { setLeOpen(!leOpen); setEncOpen(false); setLangOpen(false); }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:opacity-80 ${controlsDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          title={controlsDisabled ? '文件完整加载后可切换换行符' : '点击切换换行符'}
          disabled={controlsDisabled}
          >
            <span className="font-medium">{lineEnding || 'LF'}</span>
            <ChevronUp size={10} className={`transition-transform ${leOpen ? 'rotate-180' : ''}`} />
          </button>
          {leOpen && !controlsDisabled && (
            <div
              className="absolute bottom-full right-0 mb-1 py-1.5 rounded-lg shadow-xl border z-50 min-w-[100px]"
              style={{ backgroundColor: 'var(--te-bg-tertiary)', borderColor: 'var(--te-border)' }}
            >
              {LINE_ENDINGS.map((le) => (
                <button
                  key={le}
                  onClick={() => { onLineEndingChange?.(le); setLeOpen(false); }}
                  className={`block w-full text-left px-3 py-1.5 text-xs rounded transition-colors hover:opacity-80 ${lineEnding === le ? 'font-medium' : ''}`}
                  style={lineEnding === le
                    ? { backgroundColor: 'color-mix(in srgb, var(--te-primary) 15%, transparent)', color: 'var(--te-primary)' }
                    : { color: 'var(--te-text-primary)' }
                  }
                >
                  {le}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" ref={encRef}>
          <button
          onClick={() => { setEncOpen(!encOpen); setLangOpen(false); setLeOpen(false); }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:opacity-80 ${controlsDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          title={controlsDisabled ? '文件完整加载后可切换编码' : '点击切换编码'}
          disabled={controlsDisabled}
          >
            <span className="font-medium">{activeTab?.encoding || 'UTF-8'}</span>
            <ChevronUp size={10} className={`transition-transform ${encOpen ? 'rotate-180' : ''}`} />
          </button>
          {encOpen && !controlsDisabled && (
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
