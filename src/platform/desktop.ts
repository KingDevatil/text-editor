import type { DirEntry } from '../types';
import type { SearchMatch, SearchOptions } from '../services/searchService';

export interface FileMeta {
  file_size: number;
  encoding: string;
  total_lines: number;
  first_chunk: string;
}

export interface ReadFileResult {
  text: string;
  encoding: string;
}

export interface FileChangeEvent {
  path: string;
  kind: 'change' | 'unlink';
}

type Unlisten = () => void;

interface ElectronDesktopBridge {
  platform?: string;
  readFileAuto(path: string): Promise<ReadFileResult>;
  readFileWithEncoding(path: string, encoding: string): Promise<ReadFileResult>;
  readFileMeta(path: string): Promise<FileMeta>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  listDirectory(path: string): Promise<DirEntry[]>;
  searchDirectory(dir: string, options: SearchOptions, maxResults?: number, searchId?: string): Promise<SearchMatch[]>;
  cancelSearch(searchId?: string): Promise<void>;
  watchFile(path: string): Promise<void>;
  unwatchFile(path: string): Promise<void>;
  getPendingFiles(): Promise<string[]>;
  rendererReady(): Promise<void>;
  openFileDialog(options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string[]>;
  openFolderDialog(): Promise<string | null>;
  saveFileDialog(options?: { suggestedName?: string }): Promise<string | null>;
  confirm(message: string, options?: { title?: string }): Promise<boolean>;
  message(message: string, options?: { title?: string; kind?: 'info' | 'warning' | 'error' }): Promise<void>;
  revealInFolder(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  writeClipboard(text: string): Promise<void>;
  readClipboard(): Promise<string>;
  windowShow(): Promise<void>;
  windowIsMaximized(): Promise<boolean>;
  windowMinimize(): Promise<void>;
  windowToggleMaximize(): Promise<boolean>;
  windowClose(): Promise<void>;
  windowForceClose(): Promise<void>;
  registerDefaultApp(): Promise<string>;
  onFileChanged(handler: (change: FileChangeEvent) => void): Unlisten;
  onOpenFile(handler: (path: string) => void): Unlisten;
  onDragDropEvent(handler: (paths: string[]) => void): Promise<Unlisten>;
}

declare global {
  interface Window {
    electronDesktop?: ElectronDesktopBridge;
  }
}

function electronBridge(): ElectronDesktopBridge | undefined {
  return typeof window !== 'undefined' ? window.electronDesktop : undefined;
}

function requireDesktop(bridge: ElectronDesktopBridge | undefined): ElectronDesktopBridge {
  if (!bridge) throw new Error('Desktop API is not available in this environment');
  return bridge;
}

export const desktopApi = {
  isDesktop(): boolean {
    return Boolean(electronBridge());
  },

  platform(): string {
    return electronBridge()?.platform ?? 'browser';
  },

  async readFileAuto(path: string): Promise<ReadFileResult> {
    return requireDesktop(electronBridge()).readFileAuto(path);
  },

  async readFileWithEncoding(path: string, encoding: string): Promise<ReadFileResult> {
    return requireDesktop(electronBridge()).readFileWithEncoding(path, encoding);
  },

  async readFileMeta(path: string): Promise<FileMeta> {
    return requireDesktop(electronBridge()).readFileMeta(path);
  },

  async writeFile(path: string, content: string, encoding: string): Promise<void> {
    return requireDesktop(electronBridge()).writeFile(path, content, encoding);
  },

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    return requireDesktop(electronBridge()).renameFile(oldPath, newPath);
  },

  async listDirectory(path: string): Promise<DirEntry[]> {
    return requireDesktop(electronBridge()).listDirectory(path);
  },

  async searchDirectory(dir: string, options: SearchOptions, maxResults?: number, searchId?: string): Promise<SearchMatch[]> {
    return requireDesktop(electronBridge()).searchDirectory(dir, options, maxResults, searchId);
  },

  async cancelSearch(searchId?: string): Promise<void> {
    const electron = electronBridge();
    if (electron) await electron.cancelSearch(searchId);
  },

  async watchFile(path: string): Promise<void> {
    return requireDesktop(electronBridge()).watchFile(path);
  },

  async unwatchFile(path: string): Promise<void> {
    return requireDesktop(electronBridge()).unwatchFile(path);
  },

  async getPendingFiles(): Promise<string[]> {
    return requireDesktop(electronBridge()).getPendingFiles();
  },

  async rendererReady(): Promise<void> {
    const electron = electronBridge();
    if (electron) await electron.rendererReady();
  },

  async openFileDialog(options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string[]> {
    const electron = electronBridge();
    return electron ? electron.openFileDialog(options) : [];
  },

  async openFolderDialog(): Promise<string | null> {
    const electron = electronBridge();
    return electron ? electron.openFolderDialog() : null;
  },

  async saveFileDialog(options?: { suggestedName?: string }): Promise<string | null> {
    const electron = electronBridge();
    return electron ? electron.saveFileDialog(options) : null;
  },

  async confirm(message: string, options?: { title?: string }): Promise<boolean> {
    const electron = electronBridge();
    return electron ? electron.confirm(message, options) : window.confirm(message);
  },

  async message(message: string, options?: { title?: string; kind?: 'info' | 'warning' | 'error' }): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.message(message, options);
    window.alert(message);
  },

  async revealInFolder(path: string): Promise<void> {
    return requireDesktop(electronBridge()).revealInFolder(path);
  },

  async openExternal(url: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.openExternal(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async writeClipboard(text: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.writeClipboard(text);
    await navigator.clipboard.writeText(text);
  },

  async readClipboard(): Promise<string> {
    const electron = electronBridge();
    return electron ? electron.readClipboard() : navigator.clipboard.readText();
  },

  async windowShow(): Promise<void> {
    const electron = electronBridge();
    if (electron) await electron.windowShow();
  },

  async windowIsMaximized(): Promise<boolean> {
    const electron = electronBridge();
    return electron ? electron.windowIsMaximized() : false;
  },

  async windowMinimize(): Promise<void> {
    const electron = electronBridge();
    if (electron) await electron.windowMinimize();
  },

  async windowToggleMaximize(): Promise<boolean> {
    const electron = electronBridge();
    return electron ? electron.windowToggleMaximize() : false;
  },

  async windowClose(): Promise<void> {
    const electron = electronBridge();
    if (electron) await electron.windowClose();
  },

  async windowForceClose(): Promise<void> {
    const electron = electronBridge();
    if (electron) await electron.windowForceClose();
  },

  async registerDefaultApp(): Promise<string> {
    return requireDesktop(electronBridge()).registerDefaultApp();
  },

  onFileChanged(handler: (change: FileChangeEvent) => void): Unlisten {
    const electron = electronBridge();
    return electron ? electron.onFileChanged(handler) : () => {};
  },

  onOpenFile(handler: (path: string) => void): Unlisten {
    const electron = electronBridge();
    return electron ? electron.onOpenFile(handler) : () => {};
  },

  async onDragDropEvent(handler: (paths: string[]) => void): Promise<Unlisten> {
    const electron = electronBridge();
    return electron ? electron.onDragDropEvent(handler) : () => {};
  },
};

export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx > 0 ? path.slice(0, idx) : '';
}

export function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

export function joinPath(base: string, name: string): string {
  if (!base) return name;
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${sep}${name}`;
}
