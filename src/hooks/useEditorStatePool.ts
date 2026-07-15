import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { deleteCompartments } from '../utils/editorExtensions';

interface StatePool {
  states: Map<string, EditorState>;
}

const pool: StatePool = { states: new Map() };

export function getEditorState(tabId: string): EditorState | undefined {
  return pool.states.get(tabId);
}

// Track closed tab IDs to prevent stale re-writes during component unmount
const closedTabs = new Set<string>();

export function setEditorState(tabId: string, state: EditorState): void {
  if (closedTabs.has(tabId)) return;
  pool.states.set(tabId, state);
}

export function deleteEditorState(tabId: string): void {
  closedTabs.add(tabId);
  pool.states.delete(tabId);
  scrollTops.delete(tabId);
  activeViews.delete(tabId);
  clearContentListeners(tabId);
  clearDocumentChangeListeners(tabId);
  clearEditorUpdateListeners(tabId);
  deleteCompartments(tabId);
}

/** Remove tabId from closed-tabs guard so it can be reused (e.g. in tests). */
export function reopenTab(tabId: string): void {
  closedTabs.delete(tabId);
}

export function getEditorContent(tabId: string): string {
  const state = pool.states.get(tabId);
  return state?.doc.toString() ?? '';
}

export function getEditorLineCount(tabId: string): number {
  const state = pool.states.get(tabId);
  return state?.doc.lines ?? 0;
}

export function getEditorValueLength(tabId: string): number {
  const state = pool.states.get(tabId);
  return state?.doc.length ?? 0;
}

export function hasEditorState(tabId: string): boolean {
  return pool.states.has(tabId);
}

// ── Content change pub/sub (event-driven replacement for polling) ──

export type ContentChangeListener = (content: string) => void;

const contentListeners = new Map<string, Set<ContentChangeListener>>();
export type DocumentChangeListener = () => void;
const documentChangeListeners = new Map<string, Set<DocumentChangeListener>>();

/** Subscribe without materializing the whole document as a string. */
export function subscribeDocumentChange(
  tabId: string,
  listener: DocumentChangeListener
): () => void {
  let set = documentChangeListeners.get(tabId);
  if (!set) {
    set = new Set();
    documentChangeListeners.set(tabId, set);
  }
  set.add(listener);
  listener();
  return () => {
    set?.delete(listener);
    if (set?.size === 0) documentChangeListeners.delete(tabId);
  };
}

/**
 * Subscribe to content changes for a specific tab.
 * The listener receives the current content string whenever the doc changes.
 * Returns an unsubscribe function.
 */
export function subscribeContentChange(
  tabId: string,
  listener: ContentChangeListener
): () => void {
  let set = contentListeners.get(tabId);
  if (!set) {
    set = new Set();
    contentListeners.set(tabId, set);
  }
  set.add(listener);
  // Immediately emit current content so subscriber is in sync
  const current = getEditorContent(tabId);
  listener(current);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      contentListeners.delete(tabId);
    }
  };
}

/**
 * Notify all listeners for a tab that content has changed.
 * Called by CmEditor's updateListener when docChanged is true.
 */
export function notifyContentChange(tabId: string): void {
  const documentSet = documentChangeListeners.get(tabId);
  if (documentSet) {
    for (const listener of documentSet) {
      try {
        listener();
      } catch (err) {
        console.error('[notifyContentChange] document listener error:', err);
      }
    }
  }

  const set = contentListeners.get(tabId);
  if (!set || set.size === 0) return;
  const content = getEditorContent(tabId);
  for (const listener of set) {
    try {
      listener(content);
    } catch (err) {
      console.error('[notifyContentChange] listener error:', err);
    }
  }
}

/** Clean up all listeners for a tab (call on tab close). */
export function clearContentListeners(tabId: string): void {
  contentListeners.delete(tabId);
}

export function clearDocumentChangeListeners(tabId: string): void {
  documentChangeListeners.delete(tabId);
}

// ── Editor update pub/sub (for Minimap and other view-dependent consumers) ──

export type EditorUpdateListener = () => void;

const editorUpdateListeners = new Map<string, Set<EditorUpdateListener>>();

/**
 * Subscribe to any CodeMirror update for a tab (doc change, viewport change, selection change).
 * Used by Minimap to repaint without polling.
 */
export function subscribeEditorUpdate(
  tabId: string,
  listener: EditorUpdateListener
): () => void {
  let set = editorUpdateListeners.get(tabId);
  if (!set) {
    set = new Set();
    editorUpdateListeners.set(tabId, set);
  }
  set.add(listener);
  // Immediate call so subscriber catches up with current state
  try {
    listener();
  } catch (err) {
    console.error('[subscribeEditorUpdate] immediate listener error:', err);
  }
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      editorUpdateListeners.delete(tabId);
    }
  };
}

/** Notify all editor-update listeners for a tab. Called by CmEditor's updateListener. */
export function notifyEditorUpdate(tabId: string): void {
  const set = editorUpdateListeners.get(tabId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener();
    } catch (err) {
      console.error('[notifyEditorUpdate] listener error:', err);
    }
  }
}

/** Clean up all editor-update listeners for a tab. */
export function clearEditorUpdateListeners(tabId: string): void {
  editorUpdateListeners.delete(tabId);
}

/** Clear all listeners across every tab. Useful for test isolation. */
export function clearAllListeners(): void {
  contentListeners.clear();
  documentChangeListeners.clear();
  editorUpdateListeners.clear();
}

// Scroll position per tab (CodeMirror EditorView scrollTop)
const scrollTops = new Map<string, number>();

export function getEditorScrollTop(tabId: string): number | undefined {
  return scrollTops.get(tabId);
}

export function setEditorScrollTop(tabId: string, scrollTop: number): void {
  if (closedTabs.has(tabId)) return;
  scrollTops.set(tabId, scrollTop);
}

export function deleteEditorScrollTop(tabId: string): void {
  scrollTops.delete(tabId);
}

/**
 * Replace content for an existing tab while preserving selection when possible.
 * Used when re-reading a file (encoding change, reload, drag-drop update).
 */
export function updateEditorContent(tabId: string, newContent: string): void {
  const view = getActiveView(tabId);
  if (view) {
    // Always dispatch from the view's current state to avoid stale-state issues
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: newContent,
      },
    });
    pool.states.set(tabId, view.state);
    return;
  }

  const oldState = pool.states.get(tabId);
  if (!oldState) {
    return;
  }

  const tr = oldState.update({
    changes: {
      from: 0,
      to: oldState.doc.length,
      insert: newContent,
    },
  });
  pool.states.set(tabId, tr.state);
}

// Track active EditorView instances per tab (set by CmEditor component)
const activeViews = new Map<string, EditorView>();

export function setActiveView(tabId: string, view: EditorView | null): void {
  if (view) {
    activeViews.set(tabId, view);
  } else {
    activeViews.delete(tabId);
  }
}

export function getActiveView(tabId: string): EditorView | undefined {
  return activeViews.get(tabId);
}

// ── Pending scroll / selection / line number for session restore & search jump ──

const pendingScrollTops = new Map<string, number>();
const pendingSelections = new Map<string, { anchor: number; head: number }>();
const pendingLineNumbers = new Map<string, number>();

export function setPendingScrollTop(tabId: string, scrollTop: number): void {
  pendingScrollTops.set(tabId, scrollTop);
}

export function takePendingScrollTop(tabId: string): number | undefined {
  const v = pendingScrollTops.get(tabId);
  pendingScrollTops.delete(tabId);
  return v;
}

export function setPendingSelection(tabId: string, anchor: number, head: number): void {
  pendingSelections.set(tabId, { anchor, head });
}

export function takePendingSelection(tabId: string): { anchor: number; head: number } | undefined {
  const v = pendingSelections.get(tabId);
  pendingSelections.delete(tabId);
  return v;
}

export function setPendingLineNumber(tabId: string, lineNumber: number): void {
  pendingLineNumbers.set(tabId, lineNumber);
}

export function takePendingLineNumber(tabId: string): number | undefined {
  const v = pendingLineNumbers.get(tabId);
  pendingLineNumbers.delete(tabId);
  return v;
}
