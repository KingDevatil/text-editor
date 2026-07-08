import { EditorState } from '@codemirror/state';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FindReplace from './FindReplace';
import { useEditorStore } from '../hooks/useEditorStore';
import { useUIStore } from '../hooks/useUIStore';
import { useMarkdownSearchStore } from '../hooks/useMarkdownDocumentSearch';
import { getActiveView } from '../hooks/useEditorStatePool';

vi.mock('../hooks/useEditorStatePool', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useEditorStatePool')>('../hooks/useEditorStatePool');
  return {
    ...actual,
    getActiveView: vi.fn(),
  };
});

const getActiveViewMock = vi.mocked(getActiveView);

function renderFindReplace() {
  return render(
    <FindReplace
      visible={true}
      onClose={vi.fn()}
    />
  );
}

describe('FindReplace markdown search target', () => {
  beforeEach(() => {
    getActiveViewMock.mockReset();
    useEditorStore.setState({
      tabs: [
        {
          id: 'tab-md',
          title: 'note.md',
          language: 'markdown',
          isDirty: false,
          encoding: 'UTF-8',
          group: 1,
        },
      ],
      activeTabId: 'tab-md',
      activeGroup1TabId: 'tab-md',
      activeGroup2TabId: null,
      splitMode: false,
    });
    useUIStore.setState({
      previewVisible: true,
      readMode: false,
    });
    useMarkdownSearchStore.setState({ query: null, direction: 1, sequence: 0, matchCount: 0, currentMatch: 0 });
  });

  it('keeps searching the editor when preview is open but focus is not in preview', async () => {
    const dispatch = vi.fn();
    getActiveViewMock.mockReturnValue({
      state: EditorState.create({ doc: 'alpha beta' }),
      dispatch,
    } as unknown as ReturnType<typeof getActiveView>);

    renderFindReplace();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'alpha' } });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalled();
    });
    expect(useMarkdownSearchStore.getState().query).toBeNull();
  });

  it('searches markdown preview when focus is inside the preview surface', async () => {
    const previewSurface = document.createElement('div');
    previewSurface.dataset.markdownSearchSurface = 'preview';
    previewSurface.tabIndex = -1;
    document.body.appendChild(previewSurface);
    previewSurface.focus();

    getActiveViewMock.mockReturnValue({
      state: EditorState.create({ doc: 'alpha beta' }),
      dispatch: vi.fn(),
    } as unknown as ReturnType<typeof getActiveView>);

    renderFindReplace();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'alpha' } });

    await waitFor(() => {
      expect(useMarkdownSearchStore.getState().query?.query).toBe('alpha');
    });

    previewSurface.remove();
  });
});
