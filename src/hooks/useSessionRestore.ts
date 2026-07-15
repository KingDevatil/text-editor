import { useEffect } from 'react';
import { useEditorStore } from './useEditorStore';
import {
  getEditorState,
  getEditorContent,
  getEditorScrollTop,
  hasEditorState,
  setPendingScrollTop,
  setPendingSelection,
  updateEditorContent,
} from './useEditorStatePool';
import type { Encoding } from '../types';
import { normalizeLineEnding } from '../utils/lineEnding';
import { desktopApi } from '../platform/desktop';

const SESSION_KEY = 'te2-session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const PROGRESSIVE_RESTORE_THRESHOLD = 2 * 1024 * 1024;
const RECOVERY_MAX_TAB_CHARS = 1024 * 1024;
const RECOVERY_MAX_TOTAL_CHARS = 2 * 1024 * 1024;

interface SessionTab {
  title: string;
  filePath?: string;
  language: string;
  encoding: Encoding;
  lineEnding?: string;
  group: 1 | 2;
  columnAlignEnabled?: boolean;
  scrollTop: number;
  cursorAnchor?: number;
  cursorHead?: number;
  content?: string;
  isDirty?: boolean;
  recoveryOmitted?: boolean;
}

interface SessionData {
  tabs: SessionTab[];
  activeFilePath?: string;
  activeGroup1FilePath?: string;
  activeGroup2FilePath?: string;
  splitMode: boolean;
  timestamp: number;
}

export function saveSession(options: { includeRecovery?: boolean } = {}): void {
  try {
    const includeRecovery = options.includeRecovery ?? true;
    const { tabs, activeTabId, activeGroup1TabId, activeGroup2TabId, splitMode } =
      useEditorStore.getState();

    const restorableTabs = tabs.filter((tab) => tab.kind !== 'searchResults');
    let recoveredChars = 0;
    const sessionTabs: SessionTab[] = restorableTabs.map((tab) => {
      const state = getEditorState(tab.id);
      const scrollTop = getEditorScrollTop(tab.id) ?? 0;
      const sel = state?.selection.main;
      const sessionTab: SessionTab = {
        title: tab.title,
        filePath: tab.filePath,
        language: tab.language,
        encoding: tab.encoding,
        lineEnding: tab.lineEnding,
        group: (tab.group || 1) as 1 | 2,
        columnAlignEnabled: tab.columnAlignEnabled,
        scrollTop,
        cursorAnchor: sel?.anchor,
        cursorHead: sel?.head,
      };
      if (includeRecovery && (tab.isDirty || !tab.filePath)) {
        const content = state?.doc.toString() ?? tab.initialContent ?? '';
        if (
          content.length <= RECOVERY_MAX_TAB_CHARS
          && recoveredChars + content.length <= RECOVERY_MAX_TOTAL_CHARS
        ) {
          sessionTab.content = content;
          sessionTab.isDirty = tab.isDirty;
          recoveredChars += content.length;
        } else {
          sessionTab.recoveryOmitted = true;
        }
      }
      return sessionTab;
    });

    const findPath = (tabId: string | null) =>
      restorableTabs.find((t) => t.id === tabId)?.filePath;

    const session: SessionData = {
      tabs: sessionTabs,
      activeFilePath: findPath(activeTabId),
      activeGroup1FilePath: findPath(activeGroup1TabId),
      activeGroup2FilePath: findPath(activeGroup2TabId),
      splitMode,
      timestamp: Date.now(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

/**
 * Tracks a file path that was opened via file association (double-click in OS).
 * Session restore should respect this over the session's activeFilePath.
 */
let userOpenedFilePath: string | null = null;

export function recordUserOpenedFile(path: string): void {
  userOpenedFilePath = path;
}

function takeUserOpenedFile(): string | null {
  const p = userOpenedFilePath;
  userOpenedFilePath = null;
  return p;
}

/** Promise that resolves when session restore finishes (or immediately if no session). */
let sessionRestorePromise: Promise<void> | null = null;

function currentTabContent(tabId: string): string {
  if (hasEditorState(tabId)) return getEditorContent(tabId);
  return useEditorStore.getState().tabs.find((tab) => tab.id === tabId)?.initialContent ?? '';
}

export function waitForSessionRestore(): Promise<void> {
  return sessionRestorePromise ?? Promise.resolve();
}

export function useSessionRestore() {
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;

    let session: SessionData;
    try {
      session = JSON.parse(raw);
    } catch {
      return;
    }

    if (Date.now() - session.timestamp > SESSION_MAX_AGE) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }

    const {
      createTab,
      setActiveTabId,
      setActiveGroup1TabId,
      setActiveGroup2TabId,
      setSplitMode,
      setTabColumnAlign,
      setTabEncoding,
      setTabInitialContent,
      setTabLoadState,
      setTabLargeFile,
      setTabLineEnding,
      markTabDirty,
      markTabSaved,
      tabs: currentTabs,
    } = useEditorStore.getState();

    // Avoid double-restore if tabs already exist (e.g. file-association opened files first)
    if (currentTabs.length > 0) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }

    const restore = async () => {
      const openedIds: string[] = [];
      const pathToId = new Map<string, string>();

      for (const st of session.tabs) {
        let newTab;
        if (st.content !== undefined) {
          newTab = createTab(
            st.title,
            st.language as import('../types').Language,
            st.filePath,
            st.group,
            st.encoding,
            st.content,
            st.lineEnding as import('../types').LineEnding
          );
          if (st.isDirty) markTabDirty(newTab.id, true);
        } else if (st.filePath && desktopApi.isDesktop()) {
          try {
            const meta = await desktopApi.readFileMeta(st.filePath);
            if (meta.file_size > PROGRESSIVE_RESTORE_THRESHOLD) {
              const firstChunk = normalizeLineEnding(
                meta.first_chunk,
                st.lineEnding as import('../types').LineEnding
              );
              newTab = createTab(
                st.title,
                st.language as import('../types').Language,
                st.filePath,
                st.group,
                meta.encoding as Encoding,
                firstChunk,
                st.lineEnding as import('../types').LineEnding
              );
              setTabLargeFile(newTab.id, true);
              setTabLoadState(newTab.id, 'loading');
              const restoredTabId = newTab.id;
              const expectedPartialContent = firstChunk;
              desktopApi.readFileAuto(st.filePath)
                .then((result) => {
                  const latest = useEditorStore.getState().tabs.find((tab) => tab.id === restoredTabId);
                  if (!latest) return;
                  if (latest.isDirty || currentTabContent(restoredTabId) !== expectedPartialContent) {
                    setTabLoadState(restoredTabId, 'error', '完整内容加载期间标签内容发生变化，请关闭后重新打开文件。');
                    return;
                  }
                  const normalizedText = normalizeLineEnding(
                    result.text,
                    st.lineEnding as import('../types').LineEnding
                  );
                  if (hasEditorState(restoredTabId)) {
                    updateEditorContent(restoredTabId, normalizedText);
                    setTabInitialContent(restoredTabId, '');
                  } else {
                    setTabInitialContent(restoredTabId, normalizedText);
                  }
                  setTabEncoding(restoredTabId, result.encoding as Encoding);
                  if (st.lineEnding) setTabLineEnding(restoredTabId, st.lineEnding as import('../types').LineEnding);
                  markTabSaved(restoredTabId);
                  setTabLoadState(restoredTabId, 'ready');
                })
                .catch((err) => {
                  console.error('[SessionRestore] failed to load full content:', st.filePath, err);
                  const message = err instanceof Error ? err.message : String(err);
                  setTabLoadState(restoredTabId, 'error', message);
                  void desktopApi.message(`无法完整恢复“${st.title}”：${message}`, {
                    title: '会话恢复失败',
                    kind: 'error',
                  }).catch(() => {});
                });
            } else {
              const result = await desktopApi.readFileAuto(st.filePath);
              // Normalize file content to the session's line ending so CodeMirror's
              // lineSeparator matches the document (prevents \n from being treated as
              // plain text when lineSeparator is \r\n).
              const normalizedText = normalizeLineEnding(
                result.text,
                st.lineEnding as import('../types').LineEnding
              );
              newTab = createTab(
                st.title,
                st.language as import('../types').Language,
                st.filePath,
                st.group,
                result.encoding as Encoding,
                normalizedText,
                st.lineEnding as import('../types').LineEnding
              );
            }
          } catch {
            // File no longer exists or cannot be read; drop the stale session tab.
            continue;
          }
        } else {
          newTab = createTab(st.title, st.language as import('../types').Language, undefined, st.group);
        }

        if (newTab) {
          openedIds.push(newTab.id);
          if (st.filePath) pathToId.set(st.filePath, newTab.id);
          if (st.columnAlignEnabled) {
            setTabColumnAlign(newTab.id, true);
          }
          // Queue scroll and cursor restoration for when CmEditor mounts
          setPendingScrollTop(newTab.id, st.scrollTop);
          if (st.cursorAnchor !== undefined && st.cursorHead !== undefined) {
            setPendingSelection(newTab.id, st.cursorAnchor, st.cursorHead);
          }
        }
      }

      if (session.splitMode && openedIds.length >= 2) {
        setSplitMode(true);
      }

      if (session.activeGroup1FilePath) {
        const id = pathToId.get(session.activeGroup1FilePath);
        if (id) setActiveGroup1TabId(id);
      }
      if (session.activeGroup2FilePath) {
        const id = pathToId.get(session.activeGroup2FilePath);
        if (id) setActiveGroup2TabId(id);
      }

      // File association (double-click in OS) takes priority over session restore
      const userFile = takeUserOpenedFile();
      if (userFile) {
        const id = pathToId.get(userFile);
        if (id) {
          setActiveTabId(id);
        }
      } else if (session.activeFilePath) {
        const id = pathToId.get(session.activeFilePath);
        if (id) setActiveTabId(id);
      }

      // Clear session after successful restore
      localStorage.removeItem(SESSION_KEY);
    };

    sessionRestorePromise = restore();
    sessionRestorePromise
      .then(() => {
        sessionRestorePromise = null;
      })
      .catch(() => {
        sessionRestorePromise = null;
        localStorage.removeItem(SESSION_KEY);
      });
  }, []);
}
