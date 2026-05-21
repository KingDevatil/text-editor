import { invoke } from '@tauri-apps/api/core';

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  regexMode: boolean;
}

export interface SearchMatch {
  filePath: string;
  lineNumber: number;
  lineText: string;
  matchStart: number;
  matchEnd: number;
}

export async function searchDirectory(
  dir: string,
  options: SearchOptions,
  maxResults?: number
): Promise<SearchMatch[]> {
  const results = await invoke<
    Array<{
      file_path: string;
      line_number: number;
      line_text: string;
      match_start: number;
      match_end: number;
    }>
  >('search_directory', {
    dir,
    query: options.query,
    caseSensitive: options.caseSensitive,
    regexMode: options.regexMode,
    maxResults: maxResults ?? 1000,
  });

  return results.map((r) => ({
    filePath: r.file_path,
    lineNumber: r.line_number,
    lineText: r.line_text,
    matchStart: r.match_start,
    matchEnd: r.match_end,
  }));
}

export interface MatchPreview {
  before: string;
  match: string;
  after: string;
}

const MAX_PREVIEW_WIDTH = 200;
const PREVIEW_CONTEXT = 60;

export function formatMatchPreview(
  line: string,
  matchStart: number,
  matchEnd: number,
  maxWidth: number = MAX_PREVIEW_WIDTH
): MatchPreview {
  let start = Math.max(0, matchStart - PREVIEW_CONTEXT);
  let end = Math.min(line.length, matchEnd + PREVIEW_CONTEXT);

  if (end - start > maxWidth) {
    if (matchStart - start > maxWidth / 2) {
      start = matchStart - Math.floor(maxWidth / 3);
    }
    if (end - matchEnd > maxWidth / 2) {
      end = matchEnd + Math.floor(maxWidth / 3);
    }
    if (end - start > maxWidth) {
      end = start + maxWidth;
    }
  }

  const before = line.slice(start, matchStart);
  const match = line.slice(matchStart, matchEnd);
  const after = line.slice(matchEnd, end);

  return {
    before: start > 0 ? '…' + before : before,
    match,
    after: end < line.length ? after + '…' : after,
  };
}
