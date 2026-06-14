import { useEffect } from 'react';
import { useEditorStore } from './useEditorStore';
import {
  getEditorState,
  getEditorScrollTop,
  setPendingScrollTop,
  setPendingSelection,
} from './useEditorStatePool';
import type { Encoding } from '../types';
import { normalizeLineEnding } from '../utils/lineEnding';
import { desktopApi } from '../platform/desktop';

const SESSION_KEY = 'te2-session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

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
}

interface SessionData {
  tabs: SessionTab[];
  activeFilePath?: string;
  activeGroup1FilePath?: string;
  activeGroup2FilePath?: string;
  splitMode: boolean;
  timestamp: number;
}

export function saveSession(): void {
  try {
    const { tabs, activeTabId, activeGroup1TabId, activeGroup2TabId, splitMode } =
      useEditorStore.getState();

    const sessionTabs: SessionTab[] = tabs.map((tab) => {
      const state = getEditorState(tab.id);
      const scrollTop = getEditorScrollTop(tab.id) ?? 0;
      const sel = state?.selection.main;
      return {
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
    });

    const findPath = (tabId: string | null) =>
      tabs.find((t) => t.id === tabId)?.filePath;

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
        if (st.filePath && desktopApi.isDesktop()) {
          try {
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
          } catch {
            // File no longer exists; open as untitled with empty content
            newTab = createTab(st.title, st.language as import('../types').Language, undefined, st.group);
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
