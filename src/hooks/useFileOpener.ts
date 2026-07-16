import { useCallback } from 'react';
import type { Encoding, Language } from '../types';
import { EXT_TO_LANGUAGE } from '../types';
import { useEditorStore } from './useEditorStore';
import { getEditorContent, hasEditorState, updateEditorContent } from './useEditorStatePool';
import { addToMru } from './useMru';
import { detectLineEnding } from '../utils/lineEnding';
import { perf } from '../utils/perf';
import { desktopApi, type FileMeta, type ReadFileResult } from '../platform/desktop';

const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024; // 2MB
const PROGRESSIVE_THRESHOLD = LARGE_FILE_THRESHOLD;

function getLanguageFromFileName(fileName: string): Language {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

export function normalizePath(p: string, platform = 'win32'): string {
  const normalized = p.replace(/\\/g, '/');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function currentTabContent(tabId: string): string {
  if (hasEditorState(tabId)) return getEditorContent(tabId);
  return useEditorStore.getState().tabs.find((tab) => tab.id === tabId)?.initialContent ?? '';
}

export type OpenFileResult = ReadFileResult;

export async function readFileAuto(filePath: string): Promise<OpenFileResult> {
  return await desktopApi.readFileAuto(filePath);
}

export async function readFileMeta(filePath: string): Promise<FileMeta> {
  return await desktopApi.readFileMeta(filePath);
}

const runBackground = (cb: () => void, delay = 100) => {
  setTimeout(cb, delay);
};

export function useFileOpener() {
  const createTab = useEditorStore((s) => s.createTab);
  const setActiveTabId = useEditorStore((s) => s.setActiveTabId);
  const setTabEncoding = useEditorStore((s) => s.setTabEncoding);
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);
  const setTabInitialContent = useEditorStore((s) => s.setTabInitialContent);
  const setTabLoadState = useEditorStore((s) => s.setTabLoadState);
  const setTabLargeFile = useEditorStore((s) => s.setTabLargeFile);
  const setTabLineEnding = useEditorStore((s) => s.setTabLineEnding);
  const markTabSaved = useEditorStore((s) => s.markTabSaved);

  const openFile = useCallback(
    async (filePath: string, options?: { text?: string; encoding?: string; fromDrop?: boolean }) => {
      if (!desktopApi.isDesktop() && !options?.text) return;

      const openStart = performance.now();

      try {
        const platform = desktopApi.platform();
        const findOpenTab = () => useEditorStore.getState().tabs.find((tab) =>
          normalizePath(tab.filePath || '', platform) === normalizePath(filePath, platform)
        );
        // Fast path: content already provided (e.g. from drag-drop)
        if (options?.text !== undefined) {
          const text = options.text;
          const detectedEncoding = options.encoding || 'UTF-8';
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          const existing = findOpenTab();
          const lineEnding = detectLineEnding(text);

          if (existing) {
            setActiveTabId(existing.id);
            if (existing.isDirty || existing.loadState !== 'ready') return;
            setTabEncoding(existing.id, detectedEncoding as Encoding);
            setTabLineEnding(existing.id, lineEnding);
            updateEditorContent(existing.id, text);
            markTabSaved(existing.id);
          } else {
            const lang = getLanguageFromFileName(fileName);
            const tab = createTab(fileName, lang, filePath, 1, detectedEncoding as Encoding, text, lineEnding);
            if (text.length > LARGE_FILE_THRESHOLD) setTabLargeFile(tab.id, true);
            if (filePath) addToMru(filePath, fileName);
          }
          perf.recordFileOpen(text.length, performance.now() - openStart);
          return;
        }

        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        const existing = findOpenTab();

        if (existing) {
          setActiveTabId(existing.id);
          if (existing.isDirty || existing.loadState !== 'ready') return;
          const contentBeforeRead = currentTabContent(existing.id);
          const result = await readFileAuto(filePath);
          const latest = useEditorStore.getState().tabs.find((tab) => tab.id === existing.id);
          if (!latest || latest.isDirty || currentTabContent(existing.id) !== contentBeforeRead) return;
          setTabEncoding(existing.id, result.encoding as Encoding);
          setTabLineEnding(existing.id, detectLineEnding(result.text));
          updateEditorContent(existing.id, result.text);
          markTabSaved(existing.id);
          return;
        }

        // Progressive loading for very large files (>2MB)
        const meta = await readFileMeta(filePath);
        const openedDuringMetadataRead = findOpenTab();
        if (openedDuringMetadataRead) {
          setActiveTabId(openedDuringMetadataRead.id);
          return;
        }
        const isProgressive = meta.file_size > PROGRESSIVE_THRESHOLD;

        if (isProgressive) {
          const tab = createTab(
            fileName,
            getLanguageFromFileName(fileName),
            filePath,
            1,
            meta.encoding as Encoding,
            meta.first_chunk,
            detectLineEnding(meta.first_chunk)
          );
          setTabLargeFile(tab.id, true);
          setTabLoadState(tab.id, 'loading');
          perf.recordFileOpen(meta.file_size, performance.now() - openStart);

          runBackground(() => {
            const expectedPartialContent = meta.first_chunk;
            readFileAuto(filePath)
              .then((result) => {
                const latest = useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id);
                if (!latest) return;
                if (latest.isDirty || currentTabContent(tab.id) !== expectedPartialContent) {
                  setTabLoadState(tab.id, 'error', '完整内容加载期间标签内容发生变化，请关闭后重新打开文件。');
                  return;
                }
                if (hasEditorState(tab.id)) {
                  updateEditorContent(tab.id, result.text);
                  setTabInitialContent(tab.id, '');
                } else {
                  setTabInitialContent(tab.id, result.text);
                }
                setTabLineEnding(tab.id, detectLineEnding(result.text));
                setTabLanguage(tab.id, getLanguageFromFileName(fileName));
                addToMru(filePath, fileName);
                // Content was reloaded from disk, not edited by user
                markTabSaved(tab.id);
                setTabLoadState(tab.id, 'ready');
              })
              .catch((err) => {
                console.error('Failed to load full content for:', filePath, err);
                const message = err instanceof Error ? err.message : String(err);
                setTabLoadState(tab.id, 'error', message);
                void desktopApi.message(`无法完整加载“${fileName}”：${message}`, {
                  title: '文件加载失败',
                  kind: 'error',
                }).catch(() => {});
              });
          }, 100);
        } else {
          const result = await readFileAuto(filePath);
          const openedDuringRead = findOpenTab();
          if (openedDuringRead) {
            setActiveTabId(openedDuringRead.id);
            return;
          }
          const lang = getLanguageFromFileName(fileName);
          const lineEnding = detectLineEnding(result.text);

          createTab(fileName, lang, filePath, 1, result.encoding as Encoding, result.text, lineEnding);
          addToMru(filePath, fileName);
          perf.recordFileOpen(result.text.length, performance.now() - openStart);
        }
      } catch (err) {
        console.error('Failed to open file:', filePath, err);
        const message = err instanceof Error ? err.message : String(err);
        void desktopApi.message(`无法打开“${filePath}”：${message}`, {
          title: '打开文件失败',
          kind: 'error',
        }).catch(() => {});
      }
    },
    [createTab, setActiveTabId, setTabEncoding, setTabLanguage, setTabInitialContent, setTabLargeFile, setTabLoadState, setTabLineEnding, markTabSaved]
  );

  return openFile;
}
