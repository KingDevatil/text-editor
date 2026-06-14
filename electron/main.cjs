const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fileService = require('./services/file.cjs');
const { listDirectory } = require('./services/directory.cjs');
const { searchDirectory } = require('./services/search.cjs');
const { createWatcherManager } = require('./services/watcher.cjs');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const pendingFiles = [];
let mainWindow = null;
let watcherManager = null;

function isString(value) {
  return typeof value === 'string' && value.length > 0;
}

function collectFileArgs(argv) {
  return argv
    .filter((arg) => !arg.startsWith('-'))
    .filter((arg) => fs.existsSync(arg))
    .map((arg) => path.resolve(arg));
}

function sendOpenFile(filePath) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-file', filePath);
  } else {
    pendingFiles.push(filePath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  watcherManager = createWatcherManager((filePath) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('file:changed', filePath);
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
    watcherManager?.closeAll();
    watcherManager = null;
  });
}

function registerIpc() {
  ipcMain.handle('file:readAuto', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    return fileService.readFileAuto(filePath);
  });
  ipcMain.handle('file:readWithEncoding', (_event, filePath, encoding) => {
    if (!isString(filePath) || !isString(encoding)) throw new Error('Invalid file read arguments');
    return fileService.readFileWithEncoding(filePath, encoding);
  });
  ipcMain.handle('file:readMeta', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    return fileService.readFileMeta(filePath);
  });
  ipcMain.handle('file:writeWithEncoding', (_event, filePath, content, encoding) => {
    if (!isString(filePath) || typeof content !== 'string' || !isString(encoding)) {
      throw new Error('Invalid file write arguments');
    }
    return fileService.writeFile(filePath, content, encoding);
  });
  ipcMain.handle('file:rename', (_event, oldPath, newPath) => {
    if (!isString(oldPath) || !isString(newPath)) throw new Error('Invalid rename arguments');
    return fileService.renameFile(oldPath, newPath);
  });
  ipcMain.handle('dir:list', (_event, dirPath) => {
    if (!isString(dirPath)) throw new Error('Invalid path');
    return listDirectory(dirPath);
  });
  ipcMain.handle('search:directory', (_event, dir, options, maxResults) => {
    if (!isString(dir) || !options || typeof options.query !== 'string') throw new Error('Invalid search arguments');
    return searchDirectory(dir, options, maxResults);
  });
  ipcMain.handle('watch:file', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    watcherManager?.watch(filePath);
  });
  ipcMain.handle('watch:unfile', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    return watcherManager?.unwatch(filePath);
  });
  ipcMain.handle('app:getPendingFiles', () => pendingFiles.splice(0));
  ipcMain.handle('dialog:openFile', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: options.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: options.filters,
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('dialog:saveFile', async (_event, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: options.suggestedName });
    return result.canceled ? null : result.filePath ?? null;
  });
  ipcMain.handle('dialog:confirm', async (_event, message, options = {}) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: options.title || app.name,
      message: String(message),
    });
    return result.response === 0;
  });
  ipcMain.handle('dialog:message', async (_event, message, options = {}) => {
    await dialog.showMessageBox(mainWindow, {
      type: options.kind || 'info',
      title: options.title || app.name,
      message: String(message),
    });
  });
  ipcMain.handle('shell:revealInFolder', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    shell.showItemInFolder(filePath);
  });
  ipcMain.handle('shell:openExternal', (_event, url) => {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol');
    return shell.openExternal(url);
  });
  ipcMain.handle('clipboard:writeText', (_event, text) => clipboard.writeText(String(text)));
  ipcMain.handle('clipboard:readText', () => clipboard.readText());
  ipcMain.handle('window:show', () => mainWindow?.show());
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:forceClose', () => mainWindow?.destroy());
  ipcMain.handle('app:registerDefaultApp', () => 'Electron installer file associations handle default app registration.');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    for (const filePath of collectFileArgs(argv)) sendOpenFile(filePath);
  });

  pendingFiles.push(...collectFileArgs(process.argv.slice(1)));
  registerIpc();

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
