import React, { useState, useRef, useEffect } from 'react';
import { FileType, ChevronUp } from 'lucide-react';
import type { EditorTab, Encoding } from '../types';

interface StatusBarProps {
  activeTab: EditorTab | null;
  theme: string;
  onEncodingChange?: (encoding: Encoding) => void;
  onLanguageChange?: (language: string) => void;
}

const ENCODINGS: Encoding[] = [
  'UTF-8',
  'UTF-8 BOM',
  'GBK',
  'GB2312',
  'GB18030',
  'BIG5',
  'Shift-JIS',
  'EUC-KR',
  'ISO-8859-1',
  'Windows-1252',
];

const LANGUAGES = [
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

const StatusBar: React.FC<StatusBarProps> = ({ activeTab, theme, onEncodingChange, onLanguageChange }) => {
  const lineCount = activeTab ? activeTab.content.split('\n').length : 0;
  const charCount = activeTab ? activeTab.content.length : 0;
  const wordCount = activeTab
    ? activeTab.content.split(/\s+/).filter((w) => w.length > 0).length
    : 0;

  const isDark = theme === 'vs-dark' || theme === 'hc-black';

  const [encOpen, setEncOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const encRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useClickOutside(encRef, () => setEncOpen(false));
  useClickOutside(langRef, () => setLangOpen(false));

  const menuStyle = {
    backgroundColor: isDark ? '#1f2937' : '#ffffff',
    borderColor: isDark ? '#374151' : '#e5e7eb',
  };

  const itemClass = (isActive: boolean) =>
    `block w-full text-left px-3 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 ${
      isActive ? 'text-blue-500 font-medium' : isDark ? 'text-gray-200' : 'text-gray-700'
    }`;

  return (
    <div
      className="flex items-center justify-between px-3 h-6 text-xs select-none relative"
      style={{
        backgroundColor: isDark ? '#030710' : '#f9fafb',
        color: isDark ? '#ffffff' : '#374151',
        borderTop: `1px solid ${isDark ? '#1f2937' : '#e5e7eb'}`,
      }}
    >
      <div className="flex items-center gap-4">
        {activeTab && (
          <>
            {/* Language Mode Switcher */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => { setLangOpen(!langOpen); setEncOpen(false); }}
                className="flex items-center gap-0.5 hover:opacity-80 cursor-pointer"
                title="点击切换语言模式"
              >
                <FileType size={12} />
                {activeTab.language.toUpperCase()}
                <ChevronUp size={10} className={`transition-transform ${langOpen ? 'rotate-180' : ''}`} />
              </button>
              {langOpen && (
                <div
                  className="absolute bottom-full left-0 mb-1 py-1 rounded shadow-lg border z-50 min-w-[140px] max-h-64 overflow-auto"
                  style={menuStyle}
                >
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => { onLanguageChange?.(lang.id); setLangOpen(false); }}
                      className={itemClass(activeTab.language === lang.id)}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span>{activeTab.isDirty ? '已修改' : '已保存'}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {activeTab && (
          <>
            <span>行: {lineCount}</span>
            <span>字符: {charCount}</span>
            <span>单词: {wordCount}</span>
          </>
        )}
        {/* Encoding Switcher */}
        <div className="relative" ref={encRef}>
          <button
            onClick={() => { setEncOpen(!encOpen); setLangOpen(false); }}
            className="flex items-center gap-0.5 hover:opacity-80 cursor-pointer"
            title="点击切换编码"
          >
            {activeTab?.encoding || 'UTF-8'}
            <ChevronUp size={10} className={`transition-transform ${encOpen ? 'rotate-180' : ''}`} />
          </button>
          {encOpen && (
            <div
              className="absolute bottom-full right-0 mb-1 py-1 rounded shadow-lg border z-50 min-w-[140px]"
              style={menuStyle}
            >
              {ENCODINGS.map((enc) => (
                <button
                  key={enc}
                  onClick={() => { onEncodingChange?.(enc); setEncOpen(false); }}
                  className={itemClass(activeTab?.encoding === enc)}
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
};

export default StatusBar;
