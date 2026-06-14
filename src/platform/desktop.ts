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

type Unlisten = () => void;

interface ElectronDesktopBridge {
  readFileAuto(path: string): Promise<ReadFileResult>;
  readFileWithEncoding(path: string, encoding: string): Promise<ReadFileResult>;
  readFileMeta(path: string): Promise<FileMeta>;
  writeFile(path: string, content: string, encoding: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  listDirectory(path: string): Promise<DirEntry[]>;
  searchDirectory(dir: string, options: SearchOptions, maxResults?: number): Promise<SearchMatch[]>;
  watchFile(path: string): Promise<void>;
  unwatchFile(path: string): Promise<void>;
  getPendingFiles(): Promise<string[]>;
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
  registerDefaultApp(): Promise<string>;
  onFileChanged(handler: (path: string) => void): Unlisten;
  onOpenFile(handler: (path: string) => void): Unlisten;
  onDragDropEvent(handler: (paths: string[]) => void): Promise<Unlisten>;
  onCloseRequested(handler: () => void): Promise<Unlisten>;
}

declare global {
  interface Window {
    electronDesktop?: ElectronDesktopBridge;
  }
}

async function tauriCore() {
  return import('@tauri-apps/api/core');
}

async function isTauriRuntime(): Promise<boolean> {
  try {
    const { isTauri } = await tauriCore();
    return isTauri();
  } catch {
    return false;
  }
}

function electronBridge(): ElectronDesktopBridge | undefined {
  return typeof window !== 'undefined' ? window.electronDesktop : undefined;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await tauriCore();
  return invoke<T>(command, args);
}

export const desktopApi = {
  isDesktop(): boolean {
    if (electronBridge()) return true;
    try {
      return Boolean('__TAURI_INTERNALS__' in window);
    } catch {
      return false;
    }
  },

  async readFileAuto(path: string): Promise<ReadFileResult> {
    const electron = electronBridge();
    if (electron) return electron.readFileAuto(path);
    return tauriInvoke<ReadFileResult>('read_file_auto_detect', { path });
  },

  async readFileWithEncoding(path: string, encoding: string): Promise<ReadFileResult> {
    const electron = electronBridge();
    if (electron) return electron.readFileWithEncoding(path, encoding);
    return tauriInvoke<ReadFileResult>('read_file_with_encoding', { path, encoding });
  },

  async readFileMeta(path: string): Promise<FileMeta> {
    const electron = electronBridge();
    if (electron) return electron.readFileMeta(path);
    return tauriInvoke<FileMeta>('read_file_meta', { path });
  },

  async writeFile(path: string, content: string, encoding: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.writeFile(path, content, encoding);
    return tauriInvoke<void>('write_file_with_encoding', { path, content, encoding });
  },

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.renameFile(oldPath, newPath);
    return tauriInvoke<void>('rename_file', { oldPath, newPath });
  },

  async listDirectory(path: string): Promise<DirEntry[]> {
    const electron = electronBridge();
    if (electron) return electron.listDirectory(path);
    return tauriInvoke<DirEntry[]>('list_directory', { path });
  },

  async searchDirectory(dir: string, options: SearchOptions, maxResults?: number): Promise<SearchMatch[]> {
    const electron = electronBridge();
    if (electron) return electron.searchDirectory(dir, options, maxResults);
    const results = await tauriInvoke<
      Array<{ file_path: string; line_number: number; line_text: string; match_start: number; match_end: number }>
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
  },

  async watchFile(path: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.watchFile(path);
    return tauriInvoke<void>('watch_file', { path });
  },

  async unwatchFile(path: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.unwatchFile(path);
    return tauriInvoke<void>('unwatch_file', { path });
  },

  async getPendingFiles(): Promise<string[]> {
    const electron = electronBridge();
    if (electron) return electron.getPendingFiles();
    return tauriInvoke<string[]>('get_pending_files');
  },

  async openFileDialog(options?: { multiple?: boolean; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string[]> {
    const electron = electronBridge();
    if (electron) return electron.openFileDialog(options);
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ multiple: options?.multiple ?? true, filters: options?.filters });
    if (!selected) return [];
    return Array.isArray(selected) ? selected : [selected];
  },

  async openFolderDialog(): Promise<string | null> {
    const electron = electronBridge();
    if (electron) return electron.openFolderDialog();
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === 'string' ? selected : null;
  },

  async saveFileDialog(options?: { suggestedName?: string }): Promise<string | null> {
    const electron = electronBridge();
    if (electron) return electron.saveFileDialog(options);
    return null;
  },

  async confirm(message: string, options?: { title?: string }): Promise<boolean> {
    const electron = electronBridge();
    if (electron) return electron.confirm(message, options);
    if (await isTauriRuntime()) {
      const dialog = await import('@tauri-apps/plugin-dialog');
      return dialog.confirm(message, options);
    }
    return window.confirm(message);
  },

  async message(message: string, options?: { title?: string; kind?: 'info' | 'warning' | 'error' }): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.message(message, options);
    if (await isTauriRuntime()) {
      const dialog = await import('@tauri-apps/plugin-dialog');
      await dialog.message(message, options);
      return;
    }
    window.alert(message);
  },

  async revealInFolder(path: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.revealInFolder(path);
    return tauriInvoke<void>('reveal_in_folder', { path });
  },

  async openExternal(url: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.openExternal(url);
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    return openUrl(url);
  },

  async writeClipboard(text: string): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.writeClipboard(text);
    if (await isTauriRuntime()) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return;
    }
    await navigator.clipboard.writeText(text);
  },

  async readClipboard(): Promise<string> {
    const electron = electronBridge();
    if (electron) return electron.readClipboard();
    if (await isTauriRuntime()) {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      return readText();
    }
    return navigator.clipboard.readText();
  },

  async windowShow(): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.windowShow();
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().show();
  },

  async windowIsMaximized(): Promise<boolean> {
    const electron = electronBridge();
    if (electron) return electron.windowIsMaximized();
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().isMaximized();
  },

  async windowMinimize(): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.windowMinimize();
    return tauriInvoke<void>('window_minimize');
  },

  async windowToggleMaximize(): Promise<boolean> {
    const electron = electronBridge();
    if (electron) return electron.windowToggleMaximize();
    return tauriInvoke<boolean>('window_maximize');
  },

  async windowClose(): Promise<void> {
    const electron = electronBridge();
    if (electron) return electron.windowClose();
    return tauriInvoke<void>('window_close');
  },

  async registerDefaultApp(): Promise<string> {
    const electron = electronBridge();
    if (electron) return electron.registerDefaultApp();
    return tauriInvoke<string>('register_as_default_app');
  },

  onFileChanged(handler: (path: string) => void): Unlisten {
    const electron = electronBridge();
    if (electron) return electron.onFileChanged(handler);
    let unlisten: Unlisten | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen<string>('file-changed', (event) => handler(event.payload)))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  },

  onOpenFile(handler: (path: string) => void): Unlisten {
    const electron = electronBridge();
    if (electron) return electron.onOpenFile(handler);
    let unlisten: Unlisten | undefined;
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen<string>('open-file', (event) => handler(event.payload)))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  },

  async onDragDropEvent(handler: (paths: string[]) => void): Promise<Unlisten> {
    const electron = electronBridge();
    if (electron) return electron.onDragDropEvent(handler);
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    return getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') handler(event.payload.paths);
    });
  },

  async onCloseRequested(handler: () => void): Promise<Unlisten> {
    const electron = electronBridge();
    if (electron) return electron.onCloseRequested(handler);
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow().onCloseRequested(() => handler());
  },
};

export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx > 0 ? path.slice(0, idx) : '';
}

export function joinPath(base: string, name: string): string {
  if (!base) return name;
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${sep}${name}`;
}
