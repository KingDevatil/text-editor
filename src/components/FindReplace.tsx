import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, X, Replace, ReplaceAll, ChevronRight, ChevronLeft, Wand2, Search, FolderOpen } from 'lucide-react';
import { SearchCursor, RegExpCursor } from '@codemirror/search';
import type { Text } from '@codemirror/state';
import { open } from '@tauri-apps/plugin-dialog';
import { isTauri } from '@tauri-apps/api/core';
import { useEditorStore } from '../hooks/useEditorStore';
import { getActiveView } from '../hooks/useEditorStatePool';
import RegexBuilderModal from './RegexBuilderModal';
import { setSearchQuery } from '../utils/searchHighlight';
import type { SearchOptions } from '../services/searchService';

/** Maximum characters to scan for match counting (prevents UI freeze on large files). */
const MAX_SCAN_CHARS = 200_000;
/** Debounce delay for match counting (ms). */
const SCAN_DEBOUNCE_MS = 200;

  /** Returns a normalize function for case-insensitive search, or undefined for case-sensitive. */
function getSearchNormalize(caseSensitive: boolean): ((s: string) => string) | undefined {
  return caseSensitive ? undefined : (s: string) => s.toLowerCase();
}

/** Create a search cursor based on regex mode. */
function createSearchCursor(doc: Text, query: string, from: number, to: number, caseSensitive: boolean, regexMode: boolean) {
  if (regexMode) {
    try {
      return new RegExpCursor(doc, query, { ignoreCase: !caseSensitive }, from, to);
    } catch {
      return null;
    }
  }
  return new SearchCursor(doc, query, from, to, getSearchNormalize(caseSensitive));
}

interface FindReplaceProps {
  visible: boolean;
  onClose: () => void;
  projectPath?: string;
  activeTabFilePath?: string;
  onSearchInFolder?: (query: string, options: SearchOptions, directory: string) => void;
  folderModeRef?: React.RefObject<{ setFolderMode: (v: boolean) => void } | null>;
}

const FindReplace: React.FC<FindReplaceProps> = ({ visible, onClose, projectPath, activeTabFilePath, onSearchInFolder, folderModeRef }) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexMode, setRegexMode] = useState(false);
  const [regexBuilderOpen, setRegexBuilderOpen] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [folderMode, setFolderMode] = useState(false);
  const [searchDir, setSearchDir] = useState('');
  const [searching, setSearching] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  // Expose setFolderMode to parent via ref
  useEffect(() => {
    if (folderModeRef && 'current' in folderModeRef) {
      (folderModeRef as React.MutableRefObject<{ setFolderMode: (v: boolean) => void } | null>).current = {
        setFolderMode: (v: boolean) => setFolderMode(v),
      };
    }
  }, [folderModeRef]);

  const activeTabId = useEditorStore((s) => s.activeTabId);

  // Set default search directory when folder mode is enabled
  useEffect(() => {
    if (folderMode && !searchDir) {
      let defaultDir = '';
      if (activeTabFilePath) {
        const lastSep = activeTabFilePath.lastIndexOf('\\');
        const lastSepPosix = activeTabFilePath.lastIndexOf('/');
        const sepIdx = Math.max(lastSep, lastSepPosix);
        if (sepIdx > 0) {
          defaultDir = activeTabFilePath.slice(0, sepIdx);
        }
      }
      if (!defaultDir && projectPath) {
        defaultDir = projectPath;
      }
      setSearchDir(defaultDir);
    }
  }, [folderMode, activeTabFilePath, projectPath, searchDir]);

  useEffect(() => {
    if (visible) {
      const view = activeTabId ? getActiveView(activeTabId) : undefined;
      if (view && !folderMode) {
        const sel = view.state.selection.main;
        if (sel.from !== sel.to) {
          const text = view.state.doc.sliceString(sel.from, sel.to);
          if (text.length <= 500) {
            queueMicrotask(() => setFindText(text));
          }
        }
      }
      if (findInputRef.current) {
        setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 10);
      }
    } else {
      // Clear search highlights and reset state when closing the panel
      const view = activeTabId ? getActiveView(activeTabId) : undefined;
      if (view) {
        view.dispatch({ effects: setSearchQuery.of(null) });
      }
      queueMicrotask(() => {
        setFindText('');
        setReplaceText('');
        setMatchCount(0);
        setCurrentMatch(0);
        setFolderMode(false);
        setSearchDir('');
      });
    }
  }, [visible, activeTabId, folderMode]);

  // Sync search highlight + debounced match counting
  useEffect(() => {
    const view = activeTabId ? getActiveView(activeTabId) : undefined;
    if (!view) return;

    view.dispatch({
      effects: setSearchQuery.of(
        findText ? { query: findText, caseSensitive, regexMode } : null
      ),
    });

    if (!findText) {
      queueMicrotask(() => {
        setMatchCount(0);
        setCurrentMatch(0);
      });
      return;
    }

    const timer = setTimeout(() => {
      const doc = view.state.doc;
      const scanTo = Math.min(doc.length, MAX_SCAN_CHARS);
      let count = 0;
      const cursor = createSearchCursor(doc, findText, 0, scanTo, caseSensitive, regexMode);
      if (cursor) {
        while (!cursor.next().done) {
          count++;
        }
      }
      const capped = doc.length > MAX_SCAN_CHARS;
      setMatchCount(capped ? -count : count); // negative = "count+" display
      setCurrentMatch(count > 0 ? 1 : 0);
    }, SCAN_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [findText, caseSensitive, regexMode, activeTabId]);

  const getView = useCallback(() => {
    return activeTabId ? getActiveView(activeTabId) : undefined;
  }, [activeTabId]);

  /** Compute the 1-based index of a match position in the document. */
  const getMatchIndex = useCallback(
    (doc: Text, pos: number) => {
      let idx = 0;
      const cursor = createSearchCursor(doc, findText, 0, doc.length, caseSensitive, regexMode);
      if (!cursor) return 0;
      while (!cursor.next().done && cursor.value.from < pos) {
        idx++;
      }
      return idx + 1;
    },
    [findText, caseSensitive, regexMode]
  );

  const findNext = useCallback(() => {
    const view = getView();
    if (!view || !findText) return;

    const { state } = view;
    const cursor = createSearchCursor(state.doc, findText, state.selection.main.to, state.doc.length, caseSensitive, regexMode);
    if (!cursor) return;
    const result = cursor.next();
    if (!result.done) {
      view.dispatch({
        selection: { anchor: result.value.from, head: result.value.to },
        scrollIntoView: true,
      });
      setCurrentMatch(getMatchIndex(state.doc, result.value.from));
    } else {
      // Wrap around to beginning
      const wrapCursor = createSearchCursor(state.doc, findText, 0, state.doc.length, caseSensitive, regexMode);
      if (!wrapCursor) return;
      const wrapResult = wrapCursor.next();
      if (!wrapResult.done) {
        view.dispatch({
          selection: { anchor: wrapResult.value.from, head: wrapResult.value.to },
          scrollIntoView: true,
        });
        setCurrentMatch(getMatchIndex(state.doc, wrapResult.value.from));
      }
    }
  }, [getView, findText, caseSensitive, regexMode, getMatchIndex]);

  const findPrevious = useCallback(() => {
    const view = getView();
    if (!view || !findText) return;

    const { state } = view;
    const from = state.selection.main.from;

    // Search from beginning to current position to find all matches before cursor
    const cursor = createSearchCursor(state.doc, findText, 0, from, caseSensitive, regexMode);
    if (!cursor) return;
    let lastMatch: { from: number; to: number } | null = null;
    while (!cursor.next().done) {
      lastMatch = cursor.value;
    }

    if (lastMatch) {
      view.dispatch({
        selection: { anchor: lastMatch.from, head: lastMatch.to },
        scrollIntoView: true,
      });
      setCurrentMatch(getMatchIndex(state.doc, lastMatch.from));
    } else {
      // Wrap around to end
      const wrapCursor = createSearchCursor(state.doc, findText, 0, state.doc.length, caseSensitive, regexMode);
      if (!wrapCursor) return;
      let finalMatch: { from: number; to: number } | null = null;
      while (!wrapCursor.next().done) {
        finalMatch = wrapCursor.value;
      }
      if (finalMatch) {
        view.dispatch({
          selection: { anchor: finalMatch.from, head: finalMatch.to },
          scrollIntoView: true,
        });
        setCurrentMatch(getMatchIndex(state.doc, finalMatch.from));
      }
    }
  }, [getView, findText, caseSensitive, regexMode, getMatchIndex]);

  const handleReplace = useCallback(() => {
    const view = getView();
    if (!view || !findText) return;

    const { state } = view;
    const sel = state.selection.main;

    // Check if current selection matches
    const selectedText = state.doc.sliceString(sel.from, sel.to);
    let matches: boolean;
    if (regexMode) {
      try {
        const re = new RegExp(findText, caseSensitive ? '' : 'i');
        const matchResult = selectedText.match(re);
        matches = matchResult !== null && matchResult[0] === selectedText;
      } catch {
        matches = false;
      }
    } else {
      matches = caseSensitive
        ? selectedText === findText
        : selectedText.toLowerCase() === findText.toLowerCase();
    }

    if (matches && sel.from !== sel.to) {
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: replaceText },
        selection: { anchor: sel.from + replaceText.length },
      });
      // Find next after replace
      setTimeout(() => findNext(), 0);
    } else {
      findNext();
    }
  }, [getView, findText, replaceText, caseSensitive, regexMode, findNext]);

  const handleReplaceAll = useCallback(() => {
    const view = getView();
    if (!view || !findText) return;

    const { state } = view;
    const changes: { from: number; to: number; insert: string }[] = [];

    const cursor = createSearchCursor(state.doc, findText, 0, state.doc.length, caseSensitive, regexMode);
    if (!cursor) return;
    while (!cursor.next().done) {
      changes.push({ from: cursor.value.from, to: cursor.value.to, insert: replaceText });
    }

    if (changes.length === 0) return;

    // Apply changes from end to start to avoid position shifts
    changes.reverse();
    view.dispatch({
      changes,
      selection: { anchor: changes[changes.length - 1].from + replaceText.length },
    });
    setMatchCount(0);
    setCurrentMatch(0);
  }, [getView, findText, replaceText, caseSensitive, regexMode]);

  const handleFolderSearch = useCallback(async () => {
    if (!findText || !searchDir || !onSearchInFolder) return;
    setSearching(true);
    try {
      await onSearchInFolder(findText, { query: findText, caseSensitive, regexMode }, searchDir);
    } finally {
      setSearching(false);
    }
  }, [findText, searchDir, caseSensitive, regexMode, onSearchInFolder]);

  const handlePickDirectory = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setSearchDir(selected);
      }
    } catch (err) {
      console.error('[FindReplace] 选择目录失败:', err);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (folderMode) {
          handleFolderSearch();
        } else if (e.shiftKey) {
          findPrevious();
        } else {
          findNext();
        }
      }
    },
    [onClose, findNext, findPrevious, folderMode, handleFolderSearch]
  );

  const handleDirKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleFolderSearch();
      }
    },
    [onClose, handleFolderSearch]
  );

  if (!visible) return null;

  const inputClass =
    'px-3 py-1.5 text-sm rounded-lg border border-[var(--te-border)] bg-[var(--te-bg-tertiary)] text-[var(--te-text-primary)] placeholder-[var(--te-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--te-primary)_50%,transparent)] focus:border-[var(--te-primary)] transition-all';

  const iconBtnClass =
    'p-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--te-bg-secondary)_80%,transparent)] text-[var(--te-text-secondary)] transition-colors active:scale-95';

  const disabledBtnClass = 'opacity-40 cursor-not-allowed active:scale-100';

  const canAct = folderMode
    ? !!findText && !!searchDir && !!onSearchInFolder && !searching
    : !!findText && !!activeTabId;

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 border-b border-[var(--te-border)] bg-[var(--te-bg-secondary)] shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={findInputRef}
              type="text"
              placeholder={folderMode ? '在文件夹中查找' : '查找'}
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`${inputClass} w-full`}
            />
            {!folderMode && matchCount !== 0 && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--te-text-secondary)] select-none">
                {currentMatch}/{Math.abs(matchCount)}{matchCount < 0 ? '+' : ''}
              </span>
            )}
          </div>
          {showReplace && !folderMode && (
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="替换为"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`${inputClass} w-full`}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!folderMode && (
            <button
              title="上一个"
              className={`${iconBtnClass} ${!canAct ? disabledBtnClass : ''}`}
              onClick={findPrevious}
              disabled={!canAct}
            >
              <ChevronLeft size={14} />
            </button>
          )}
          <button
            title={folderMode ? '在文件夹中查找' : '下一个'}
            className={`${iconBtnClass} ${!canAct ? disabledBtnClass : ''}`}
            onClick={folderMode ? handleFolderSearch : findNext}
            disabled={!canAct}
          >
            {folderMode ? <Search size={14} /> : <ChevronRight size={14} />}
          </button>
          {showReplace && !folderMode && (
            <>
              <button
                title="替换"
                className={`${iconBtnClass} ${!canAct ? disabledBtnClass : ''}`}
                onClick={handleReplace}
                disabled={!canAct}
              >
                <Replace size={14} />
              </button>
              <button
                title="全部替换"
                className={`${iconBtnClass} ${!canAct ? disabledBtnClass : ''}`}
                onClick={handleReplaceAll}
                disabled={!canAct}
              >
                <ReplaceAll size={14} />
              </button>
            </>
          )}
          {!folderMode && (
            <button
              onClick={() => setShowReplace(!showReplace)}
              className={iconBtnClass}
              title={showReplace ? '隐藏替换' : '显示替换'}
            >
              {showReplace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button onClick={onClose} className={iconBtnClass} title="关闭 (Esc)">
            <X size={14} />
          </button>
        </div>
      </div>
      {/* Directory input row — shown only in folder mode */}
      {folderMode && (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={dirInputRef}
                type="text"
                placeholder="查找目录"
                value={searchDir}
                onChange={(e) => setSearchDir(e.target.value)}
                onKeyDown={handleDirKeyDown}
                className={`${inputClass} w-full`}
              />
            </div>
          </div>
          <button
            title="浏览目录"
            className={iconBtnClass}
            onClick={handlePickDirectory}
          >
            <FolderOpen size={14} />
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-[var(--te-text-secondary)]">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="rounded border-[var(--te-border)] text-[var(--te-primary)] focus:ring-[var(--te-primary)]"
          />
          <span>区分大小写</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={regexMode}
            onChange={(e) => {
              setRegexMode(e.target.checked);
              if (e.target.checked) {
                setRegexBuilderOpen(true);
              }
            }}
            className="rounded border-[var(--te-border)] text-[var(--te-primary)] focus:ring-[var(--te-primary)]"
          />
          <span>正则模式</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={folderMode}
            onChange={(e) => setFolderMode(e.target.checked)}
            className="rounded border-[var(--te-border)] text-[var(--te-primary)] focus:ring-[var(--te-primary)]"
          />
          <span>在文件夹中查找</span>
        </label>
        {regexMode && !folderMode && (
          <button
            onClick={() => setRegexBuilderOpen(true)}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:bg-[var(--te-bg-primary)]"
            style={{
              borderColor: 'var(--te-border)',
              color: 'var(--te-primary)',
            }}
            title="打开可视化正则构建器"
          >
            <Wand2 size={10} />
            编辑正则
          </button>
        )}
        <span className="text-[var(--te-text-secondary)]">
          {folderMode ? 'Enter: 查找, Esc: 关闭' : 'Enter: 下一个, Shift+Enter: 上一个, Esc: 关闭'}
        </span>
      </div>

      <RegexBuilderModal
        open={regexBuilderOpen}
        onClose={() => setRegexBuilderOpen(false)}
        onConfirm={(regex) => {
          setFindText(regex);
          setRegexBuilderOpen(false);
        }}
        initialValue={findText}
      />
    </div>
  );
};

export default React.memo(FindReplace);
