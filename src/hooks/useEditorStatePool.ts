import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

interface StatePool {
  states: Map<string, EditorState>;
}

const pool: StatePool = { states: new Map() };

export function getEditorState(tabId: string): EditorState | undefined {
  return pool.states.get(tabId);
}

export function setEditorState(tabId: string, state: EditorState): void {
  pool.states.set(tabId, state);
}

export function deleteEditorState(tabId: string): void {
  pool.states.delete(tabId);
  scrollTops.delete(tabId);
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

// Scroll position per tab (CodeMirror EditorView scrollTop)
const scrollTops = new Map<string, number>();

export function getEditorScrollTop(tabId: string): number | undefined {
  return scrollTops.get(tabId);
}

export function setEditorScrollTop(tabId: string, scrollTop: number): void {
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
    console.log('[updateEditorContent] no state for tabId:', tabId);
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
