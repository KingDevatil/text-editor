const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const fileService = require('./services/file.cjs');
const { listDirectory } = require('./services/directory.cjs');
const { cancelSearch, searchDirectory } = require('./services/search.cjs');
const { createWatcherManager } = require('./services/watcher.cjs');
const { collectFileArgs } = require('./services/launchArgs.cjs');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const pendingFiles = [];
let mainWindow = null;
let watcherManager = null;

function isString(value) {
  return typeof value === 'string' && value.length > 0;
}

function regAdd(key, name, value) {
  return new Promise((resolve, reject) => {
    const args = ['add', key, '/f'];
    if (name) args.push('/v', name);
    else args.push('/ve');
    args.push('/d', value);
    execFile('reg.exe', args, { windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function regQuery(key) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key], { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

function regDelete(key) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['delete', key, '/f'], { windowsHide: true }, () => {
      resolve();
    });
  });
}

async function registerWindowsFileAssociations() {
  if (process.platform !== 'win32') return { protectedExts: [] };

  const exePath = process.execPath;
  const extensions = [
    'txt',
    'md',
    'mdx',
    'js',
    'jsx',
    'mjs',
    'cjs',
    'ts',
    'tsx',
    'mts',
    'cts',
    'html',
    'htm',
    'xhtml',
    'css',
    'scss',
    'sass',
    'less',
    'json',
    'jsonc',
    'json5',
    'jsonl',
    'py',
    'pyw',
    'java',
    'cpp',
    'cc',
    'cxx',
    'c',
    'h',
    'hpp',
    'cs',
    'rs',
    'go',
    'yml',
    'yaml',
    'xml',
    'svg',
    'wsdl',
    'xsd',
    'xsl',
    'xslt',
    'sql',
    'mysql',
    'pgsql',
    'sqlite',
    'ini',
    'cfg',
    'inf',
    'csv',
    'tsv',
    'env',
    'properties',
    'log',
    'sh',
    'bash',
    'zsh',
  ];
  const protectedExts = [];

  for (const ext of extensions) {
    const dotExt = `.${ext}`;
    const progId = `TextEditor.${ext}`;
    const legacyProgId = `TextEditorV2.${ext}`;
    const appKey = `HKCU\\Software\\Classes\\${progId}`;
    const legacyAppKey = `HKCU\\Software\\Classes\\${legacyProgId}`;
    const extKey = `HKCU\\Software\\Classes\\${dotExt}`;
    const userChoiceKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\${dotExt}\\UserChoice`;

    await regAdd(appKey, null, 'Text Editor');
    await regAdd(`${appKey}\\DefaultIcon`, null, `"${exePath}",0`);
    await regAdd(`${appKey}\\shell\\open\\command`, null, `"${exePath}" "%1"`);
    await regAdd(extKey, null, progId);
    await regDelete(legacyAppKey);

    if (await regQuery(userChoiceKey)) {
      protectedExts.push(dotExt);
    }
  }

  execFile('ie4uinit.exe', ['-show'], { windowsHide: true }, () => {});
  return { protectedExts };
}

async function registerWindowsContextMenu() {
  if (process.platform !== 'win32') return;

  const exePath = process.execPath;
  const menuKey = 'HKCU\\Software\\Classes\\*\\shell\\TextEditorOpen';
  await regAdd(menuKey, null, '使用 Text Editor 打开');
  await regAdd(menuKey, 'Icon', `"${exePath}",0`);
  await regAdd(menuKey, 'MUIVerb', '使用 Text Editor 打开');
  await regAdd(menuKey, 'Position', 'Top');
  await regAdd(`${menuKey}\\command`, null, `"${exePath}" "%1"`);
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
  ipcMain.handle('search:directory', (_event, dir, options, maxResults, searchId) => {
    if (!isString(dir) || !options || typeof options.query !== 'string') throw new Error('Invalid search arguments');
    return searchDirectory(dir, options, maxResults, isString(searchId) ? searchId : undefined);
  });
  ipcMain.handle('search:cancel', (_event, searchId) => {
    cancelSearch(isString(searchId) ? searchId : undefined);
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
  ipcMain.handle('app:registerDefaultApp', async () => {
    if (process.platform === 'win32') {
      await registerWindowsContextMenu();
      const { protectedExts } = await registerWindowsFileAssociations();
      if (protectedExts.length > 0) {
        return `已注册 Text Editor 的右键菜单和文件关联。以下后缀已有 Windows 默认应用保护，可能还需要在系统设置中手动确认：${protectedExts.join('、')}。`;
      }
      return '已注册 Text Editor 右键菜单，并注册为常见文本文件的打开方式。';
    }
    if (process.platform === 'darwin') {
      return 'macOS 需要在 Finder 中对具体文件类型执行“显示简介”，再通过“打开方式”选择 Text Editor 并应用到全部。';
    }
    return 'Linux 桌面环境的默认应用设置方式不统一，请在系统的默认应用或文件属性中选择 Text Editor。';
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (isString(filePath) && fs.existsSync(filePath)) {
      sendOpenFile(path.resolve(filePath));
    }
  });

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
    registerWindowsContextMenu().catch((err) => {
      console.error('[ContextMenu] register failed:', err);
    });
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
