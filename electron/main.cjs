const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');
const fileService = require('./services/file.cjs');
const { listDirectory } = require('./services/directory.cjs');
const { cancelSearch, searchDirectory } = require('./services/search.cjs');
const { createWatcherManager } = require('./services/watcher.cjs');
const { collectFileArgs } = require('./services/launchArgs.cjs');
const { isAllowedRendererUrl: checkAllowedRendererUrl } = require('./services/ipcSecurity.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:1420';
const pendingFiles = [];
let mainWindow = null;
let mainWindowState = null;
let watcherManager = null;
let rendererReadyForOpenFiles = false;

function isString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isAllowedRendererUrl(value) {
  return checkAllowedRendererUrl(value, {
    isDev,
    devServerUrl,
    entryFile: path.resolve(__dirname, '..', 'dist', 'index.html'),
  });
}

function assertTrustedIpcSender(event) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !isAllowedRendererUrl(event.senderFrame.url)
  ) {
    throw new Error('Untrusted IPC sender');
  }
}

function handleIpc(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event);
    return listener(event, ...args);
  });
}

function logStartup(message, meta) {
  const line = `[${new Date().toISOString()}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}\n`;
  console.log(line.trimEnd());
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), line);
  } catch {
    // Startup logging must never block app launch.
  }
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
  if (rendererReadyForOpenFiles && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-file', filePath);
  } else {
    pendingFiles.push(filePath);
  }
}

function createWindow() {
  rendererReadyForOpenFiles = false;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    paintWhenInitiallyHidden: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  const sendMaximizedState = (isMaximized) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized-changed', isMaximized);
    }
  };
  mainWindow.on('maximize', () => sendMaximizedState(true));
  mainWindow.on('unmaximize', () => sendMaximizedState(false));

  logStartup('window-created', { isDev, isPackaged: app.isPackaged, argv: process.argv.slice(1) });

  let rendererReadyToShow = false;
  watcherManager = createWatcherManager((change) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('file:changed', change);
  });

  const showWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
      forceRepaint(mainWindow);
      logStartup('window-shown');
    }
  };
  const showWhenRendererReady = () => {
    if (rendererReadyToShow) showWindow();
  };
  const showFallbackTimer = setTimeout(showWindow, 12000);

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    logStartup('window-load-file', { indexPath });
    mainWindow.loadFile(indexPath);
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        shell.openExternal(url).catch(() => {});
      }
    } catch {
      // Invalid URLs are denied below.
    }
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    logStartup('ready-to-show', { rendererReadyToShow });
    showWhenRendererReady();
  });
  mainWindow.webContents.once('did-finish-load', () => {
    logStartup('did-finish-load', { rendererReadyToShow });
    showWhenRendererReady();
  });
  mainWindow.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    rendererReadyForOpenFiles = false;
    rendererReadyToShow = false;
    logStartup('did-start-navigation', { isMainFrame });
  });
  mainWindow.webContents.on('did-start-loading', () => {
    logStartup('did-start-loading');
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) logStartup('renderer-console', { level, message, line, sourceId });
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Window] render process gone:', details);
    logStartup('render-process-gone', details);
    clearTimeout(showFallbackTimer);
    showWindow();
  });
  mainWindow.webContents.on('unresponsive', () => {
    console.error('[Window] renderer became unresponsive');
    logStartup('renderer-unresponsive');
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Window] failed to load:', errorCode, errorDescription, validatedURL);
    logStartup('did-fail-load', { errorCode, errorDescription, validatedURL });
    clearTimeout(showFallbackTimer);
    showWindow();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowState = null;
    rendererReadyForOpenFiles = false;
    clearTimeout(showFallbackTimer);
    watcherManager?.closeAll();
    watcherManager = null;
  });

  return {
    markRendererReadyToShow() {
      rendererReadyToShow = true;
      logStartup('renderer-ready-to-show');
      clearTimeout(showFallbackTimer);
      showWindow();
    },
  };
}

function forceRepaint(window) {
  setTimeout(() => {
    if (!window || window.isDestroyed()) return;
    if (typeof window.webContents.invalidate === 'function') {
      window.webContents.invalidate();
    }
    const bounds = window.getBounds();
    window.setBounds({ ...bounds, width: bounds.width + 1 }, false);
    window.setBounds(bounds, false);
  }, 100);
}

function registerIpc() {
  handleIpc('file:readAuto', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    return fileService.readFileAuto(filePath);
  });
  handleIpc('file:readWithEncoding', (_event, filePath, encoding) => {
    if (!isString(filePath) || !isString(encoding)) throw new Error('Invalid file read arguments');
    return fileService.readFileWithEncoding(filePath, encoding);
  });
  handleIpc('file:readMeta', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    return fileService.readFileMeta(filePath);
  });
  handleIpc('file:writeWithEncoding', (_event, filePath, content, encoding) => {
    if (!isString(filePath) || typeof content !== 'string' || !isString(encoding)) {
      throw new Error('Invalid file write arguments');
    }
    return fileService.writeFile(filePath, content, encoding);
  });
  handleIpc('file:rename', (_event, oldPath, newPath) => {
    if (!isString(oldPath) || !isString(newPath)) throw new Error('Invalid rename arguments');
    return fileService.renameFile(oldPath, newPath);
  });
  handleIpc('dir:list', (_event, dirPath) => {
    if (!isString(dirPath)) throw new Error('Invalid path');
    return listDirectory(dirPath);
  });
  handleIpc('search:directory', (_event, dir, options, maxResults, searchId) => {
    if (!isString(dir) || !options || typeof options.query !== 'string') throw new Error('Invalid search arguments');
    return searchDirectory(dir, options, maxResults, isString(searchId) ? searchId : undefined);
  });
  handleIpc('search:cancel', (_event, searchId) => {
    cancelSearch(isString(searchId) ? searchId : undefined);
  });
  handleIpc('watch:file', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    watcherManager?.watch(filePath);
  });
  handleIpc('watch:unfile', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    return watcherManager?.unwatch(filePath);
  });
  handleIpc('app:getPendingFiles', () => {
    rendererReadyForOpenFiles = true;
    return pendingFiles.splice(0);
  });
  handleIpc('dialog:openFile', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: options.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: options.filters,
    });
    return result.canceled ? [] : result.filePaths;
  });
  handleIpc('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  handleIpc('dialog:saveFile', async (_event, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: options.suggestedName });
    return result.canceled ? null : result.filePath ?? null;
  });
  handleIpc('dialog:confirm', async (_event, message, options = {}) => {
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
  handleIpc('dialog:message', async (_event, message, options = {}) => {
    await dialog.showMessageBox(mainWindow, {
      type: options.kind || 'info',
      title: options.title || app.name,
      message: String(message),
    });
  });
  handleIpc('shell:revealInFolder', (_event, filePath) => {
    if (!isString(filePath)) throw new Error('Invalid path');
    shell.showItemInFolder(filePath);
  });
  handleIpc('shell:openExternal', (_event, url) => {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error('Unsupported URL protocol');
    return shell.openExternal(url);
  });
  handleIpc('clipboard:writeText', (_event, text) => clipboard.writeText(String(text)));
  handleIpc('clipboard:readText', () => clipboard.readText());
  handleIpc('window:show', () => mainWindow?.show());
  handleIpc('app:rendererReady', () => {
    mainWindowState?.markRendererReadyToShow();
  });
  handleIpc('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));
  handleIpc('window:minimize', () => mainWindow?.minimize());
  handleIpc('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  handleIpc('window:close', () => mainWindow?.close());
  handleIpc('window:forceClose', () => mainWindow?.destroy());
  handleIpc('app:registerDefaultApp', async () => {
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
    mainWindowState = createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindowState = createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
