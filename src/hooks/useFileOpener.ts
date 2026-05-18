import { useCallback } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Encoding, Language } from '../types';
import { EXT_TO_LANGUAGE } from '../types';
import { useEditorStore } from './useEditorStore';
import { useSettingsStore } from './useSettingsStore';
import { updateEditorContent } from './useEditorStatePool';
import { perf } from '../utils/perf';

const LARGE_FILE_THRESHOLD = 500 * 1024; // 500KB
const PROGRESSIVE_THRESHOLD = 2 * 1024 * 1024; // 2MB

function getLanguageFromFileName(fileName: string): Language {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

export interface OpenFileResult {
  text: string;
  encoding: string;
}

export interface FileMeta {
  file_size: number;
  encoding: string;
  total_lines: number;
  first_chunk: string;
}

export async function readFileAuto(filePath: string): Promise<OpenFileResult> {
  return await invoke<OpenFileResult>('read_file_auto_detect', { path: filePath });
}

export async function readFileMeta(filePath: string): Promise<FileMeta> {
  return await invoke<FileMeta>('read_file_meta', { path: filePath });
}

const runBackground = (cb: () => void, delay = 100) => {
  setTimeout(cb, delay);
};

export function useFileOpener() {
  const createTab = useEditorStore((s) => s.createTab);
  const setActiveTabId = useEditorStore((s) => s.setActiveTabId);
  const setTabEncoding = useEditorStore((s) => s.setTabEncoding);
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);

  const openFile = useCallback(
    async (filePath: string, options?: { text?: string; encoding?: string; fromDrop?: boolean }) => {
      if (!isTauri() && !options?.text) return;

      const openStart = performance.now();

      try {
        // Fast path: content already provided (e.g. from drag-drop)
        if (options?.text !== undefined) {
          const text = options.text;
          const detectedEncoding = options.encoding || 'UTF-8';
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          const existing = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);

          if (existing) {
            setActiveTabId(existing.id);
            setTabEncoding(existing.id, detectedEncoding as Encoding);
            updateEditorContent(existing.id, text);
          } else {
            const isLarge = text.length > LARGE_FILE_THRESHOLD;
            const lang = isLarge ? 'plaintext' : getLanguageFromFileName(fileName);
            createTab(fileName, lang, filePath, 1, detectedEncoding as Encoding, text);
          }
          perf.recordFileOpen(text.length, performance.now() - openStart);
          return;
        }

        const fileName = filePath.split(/[\\/]/).pop() || filePath;
        const existing = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);

        if (existing) {
          // Re-read existing tab
          const result = await readFileAuto(filePath);
          setActiveTabId(existing.id);
          setTabEncoding(existing.id, result.encoding as Encoding);
          updateEditorContent(existing.id, result.text);
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
            meta.first_chunk
          );
          perf.recordFileOpen(meta.file_size, performance.now() - openStart);

          runBackground(() => {
            readFileAuto(filePath)
              .then((result) => {
                const isStillActive = useEditorStore.getState().activeTabId === tab.id;
                if (!isStillActive) return;
                updateEditorContent(tab.id, result.text);
                setTabLanguage(tab.id, getLanguageFromFileName(fileName));
              })
              .catch((err) => {
                console.error('Failed to load full content for:', filePath, err);
              });
          }, 100);
        } else {
          const result = await readFileAuto(filePath);
          const isLarge = result.text.length > LARGE_FILE_THRESHOLD;
          const lang = isLarge ? 'plaintext' : getLanguageFromFileName(fileName);

          createTab(fileName, lang, filePath, 1, result.encoding as Encoding, result.text);
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
    [createTab, setActiveTabId, setTabEncoding, setTabLanguage]
  );

  return openFile;
}
