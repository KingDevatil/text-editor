import { describe, it, expect, vi } from 'vitest';
import {
  getEditorState,
  setEditorState,
  deleteEditorState,
  getEditorContent,
  hasEditorState,
  subscribeContentChange,
  subscribeDocumentChange,
  notifyContentChange,
  subscribeEditorUpdate,
  notifyEditorUpdate,
  completeProgressiveEditorContent,
  setActiveView,
  setPendingScrollTop,
  takePendingScrollTop,
  setPendingSelection,
  takePendingSelection,
} from './useEditorStatePool';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

describe('useEditorStatePool', () => {
  const createState = (text: string) =>
    EditorState.create({ doc: text });

  it('stores and retrieves editor state', () => {
    const state = createState('hello');
    setEditorState('tab-1', state);
    expect(getEditorState('tab-1')).toBe(state);
    expect(hasEditorState('tab-1')).toBe(true);
  });

  it('returns undefined for missing state', () => {
    expect(getEditorState('nonexistent')).toBeUndefined();
    expect(hasEditorState('nonexistent')).toBe(false);
  });

  it('extracts content from state', () => {
    const state = createState('world');
    setEditorState('tab-2', state);
    expect(getEditorContent('tab-2')).toBe('world');
  });

  it('deletes state and prevents rewrites', () => {
    const state = createState('before');
    setEditorState('tab-3', state);
    deleteEditorState('tab-3');

    expect(getEditorState('tab-3')).toBeUndefined();

    // After delete, setEditorState should be ignored
    setEditorState('tab-3', createState('after'));
    expect(getEditorState('tab-3')).toBeUndefined();
  });

  it('notifies content change listeners', () => {
    const listener = vi.fn();
    const unsub = subscribeContentChange('tab-4', listener);

    // subscribe emits current content immediately
    expect(listener).toHaveBeenCalledWith('');

    setEditorState('tab-4', createState('updated'));
    notifyContentChange('tab-4');
    expect(listener).toHaveBeenCalledWith('updated');

    unsub();
  });

  it('completes a progressive load without replacing the unchanged preview prefix', () => {
    const tabId = 'tab-progressive';
    const preview = 'header\nfirst chunk\n';
    const fullContent = `${preview}remaining content\n`;
    const changes: Array<{ fromA: number; toA: number; fromB: number; toB: number }> = [];
    const parent = document.createElement('div');
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: preview,
        extensions: EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          update.changes.iterChanges((fromA, toA, fromB, toB) => {
            changes.push({ fromA, toA, fromB, toB });
          });
        }),
      }),
    });
    setEditorState(tabId, view.state);
    setActiveView(tabId, view);

    expect(completeProgressiveEditorContent(tabId, preview, fullContent)).toBe(true);
    expect(getEditorContent(tabId)).toBe(fullContent);
    expect(changes).toEqual([{
      fromA: preview.length,
      toA: preview.length,
      fromB: preview.length,
      toB: fullContent.length,
    }]);

    setActiveView(tabId, null);
    view.destroy();
  });

  it('repairs a character split at the preview byte boundary', () => {
    const tabId = 'tab-progressive-boundary';
    const preview = 'header\nabc\uFFFD';
    const fullContent = 'header\nabc你\nremaining content\n';
    setEditorState(tabId, createState(preview));

    expect(completeProgressiveEditorContent(tabId, preview, fullContent)).toBe(true);
    expect(getEditorContent(tabId)).toBe(fullContent);
  });

  it('rejects progressive completion when the file changed beyond the byte boundary', () => {
    const tabId = 'tab-progressive-file-change';
    const preview = 'original header\nfirst chunk\n';
    const changedContent = 'different header\ncomplete file\n';
    setEditorState(tabId, createState(preview));

    expect(completeProgressiveEditorContent(tabId, preview, changedContent)).toBe(false);
    expect(getEditorContent(tabId)).toBe(preview);
  });

  it('notifies lightweight document listeners without passing full content', () => {
    const listener = vi.fn();
    const unsub = subscribeDocumentChange('tab-document', listener);
    expect(listener).toHaveBeenCalledTimes(1);

    setEditorState('tab-document', createState('updated'));
    notifyContentChange('tab-document');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith();

    unsub();
  });

  it('notifies editor update listeners', () => {
    const listener = vi.fn();
    const unsub = subscribeEditorUpdate('tab-5', listener);

    // subscribe calls listener immediately
    expect(listener).toHaveBeenCalled();

    notifyEditorUpdate('tab-5');
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
  });

  it('manages pending scroll top', () => {
    setPendingScrollTop('tab-6', 123);
    expect(takePendingScrollTop('tab-6')).toBe(123);
    expect(takePendingScrollTop('tab-6')).toBeUndefined();
  });

  it('manages pending selection', () => {
    setPendingSelection('tab-7', 10, 20);
    expect(takePendingSelection('tab-7')).toEqual({ anchor: 10, head: 20 });
    expect(takePendingSelection('tab-7')).toBeUndefined();
  });
});
