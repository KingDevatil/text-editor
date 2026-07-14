import { useCallback } from 'react';
import type { Encoding, Language } from '../types';
import { EXT_TO_LANGUAGE } from '../types';
import { useEditorStore } from './useEditorStore';
import { useSettingsStore } from './useSettingsStore';
import { getEditorContent, hasEditorState, updateEditorContent } from './useEditorStatePool';
import { addToMru } from './useMru';
import { detectLineEnding } from '../utils/lineEnding';
import { perf } from '../utils/perf';
import { desktopApi, type FileMeta, type ReadFileResult } from '../platform/desktop';

const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024; // 2MB
const PROGRESSIVE_THRESHOLD = 2 * 1024 * 1024; // 2MB

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
  const setTabLineEnding = useEditorStore((s) => s.setTabLineEnding);
  const markTabSaved = useEditorStore((s) => s.markTabSaved);

  const openFile = useCallback(
    async (filePath: string, options?: { text?: string; encoding?: string; fromDrop?: boolean }) => {
      if (!desktopApi.isDesktop() && !options?.text) return;

      const openStart = performance.now();

      try {
        const platform = desktopApi.platform();
        // Fast path: content already provided (e.g. from drag-drop)
        if (options?.text !== undefined) {
          const text = options.text;
          const detectedEncoding = options.encoding || 'UTF-8';
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          const existing = useEditorStore.getState().tabs.find((t) =>
            normalizePath(t.filePath || '', platform) === normalizePath(filePath, platform)
          );
          const lineEnding = detectLineEnding(text);

          if (existing) {
            setActiveTabId(existing.id);
            if (existing.isDirty) return;
            setTabEncoding(existing.id, detectedEncoding as Encoding);
            setTabLineEnding(existing.id, lineEnding);
            updateEditorContent(existing.id, text);
            markTabSaved(existing.id);
          } else {
            const isLarge = text.length > LARGE_FILE_THRESHOLD;
            const lang = isLarge ? 'plaintext' : getLanguageFromFileName(fileName);
            createTab(fileName, lang, filePath, 1, detectedEncoding as Encoding, text, lineEnding);
            if (filePath) addToMru(filePath, fileName);
          }
          perf.recordFileOpen(text.length, performance.now() - openStart);
          return;
        }

        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        const existing = useEditorStore.getState().tabs.find((t) =>
          normalizePath(t.filePath || '', platform) === normalizePath(filePath, platform)
        );

        if (existing) {
          setActiveTabId(existing.id);
          if (existing.isDirty) return;
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
        const isProgressive = meta.file_size > PROGRESSIVE_THRESHOLD;

        if (isProgressive) {
          const tab = createTab(
            fileName,
            'plaintext',
            filePath,
            1,
            meta.encoding as Encoding,
            meta.first_chunk,
            detectLineEnding(meta.first_chunk)
          );
          perf.recordFileOpen(meta.file_size, performance.now() - openStart);

          runBackground(() => {
            const expectedPartialContent = meta.first_chunk;
            readFileAuto(filePath)
              .then((result) => {
                const latest = useEditorStore.getState().tabs.find((candidate) => candidate.id === tab.id);
                if (!latest || latest.isDirty || currentTabContent(tab.id) !== expectedPartialContent) return;
                setTabInitialContent(tab.id, result.text);
                updateEditorContent(tab.id, result.text);
                setTabLineEnding(tab.id, detectLineEnding(result.text));
                setTabLanguage(tab.id, getLanguageFromFileName(fileName));
                addToMru(filePath, fileName);
                // Content was reloaded from disk, not edited by user
                markTabSaved(tab.id);
              })
              .catch((err) => {
                console.error('Failed to load full content for:', filePath, err);
              });
          }, 100);
        } else {
          const result = await readFileAuto(filePath);
          const isLarge = result.text.length > LARGE_FILE_THRESHOLD;
          const lang = isLarge ? 'plaintext' : getLanguageFromFileName(fileName);
          const lineEnding = detectLineEnding(result.text);

          createTab(fileName, lang, filePath, 1, result.encoding as Encoding, result.text, lineEnding);
          addToMru(filePath, fileName);
          perf.recordFileOpen(result.text.length, performance.now() - openStart);

          if (isLarge) {
            const targetLang = getLanguageFromFileName(fileName);
            const shouldSwitchLang = targetLang !== 'plaintext' && !useSettingsStore.getState().largeFileOptimize;
            if (shouldSwitchLang) {
              runBackground(() => {
                setTabLanguage(useEditorStore.getState().tabs.find((t) => t.filePath === filePath)?.id || '', targetLang);
              }, 200);
            }
          }
        }
      } catch (err) {
        console.error('Failed to open file:', filePath, err);
      }
    },
    [createTab, setActiveTabId, setTabEncoding, setTabLanguage, setTabInitialContent, setTabLineEnding, markTabSaved]
  );

  return openFile;
}
