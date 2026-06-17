const { contextBridge, ipcRenderer, webUtils } = require('electron');

const validChannels = new Set(['file:changed', 'open-file']);

function on(channel, handler) {
  if (!validChannels.has(channel)) throw new Error(`Unsupported channel: ${channel}`);
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function onDragDropEvent(handler) {
  const handleDragOver = (event) => {
    event.preventDefault();
  };
  const handleDrop = (event) => {
    event.preventDefault();
    const paths = Array.from(event.dataTransfer?.files ?? [])
      .map((file) => webUtils.getPathForFile(file))
      .filter(Boolean);
    if (paths.length > 0) handler(paths);
  };
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('drop', handleDrop);
  return () => {
    window.removeEventListener('dragover', handleDragOver);
    window.removeEventListener('drop', handleDrop);
  };
}

contextBridge.exposeInMainWorld('electronDesktop', {
  readFileAuto: (path) => ipcRenderer.invoke('file:readAuto', path),
  readFileWithEncoding: (path, encoding) => ipcRenderer.invoke('file:readWithEncoding', path, encoding),
  readFileMeta: (path) => ipcRenderer.invoke('file:readMeta', path),
  writeFile: (path, content, encoding) => ipcRenderer.invoke('file:writeWithEncoding', path, content, encoding),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('file:rename', oldPath, newPath),
  listDirectory: (path) => ipcRenderer.invoke('dir:list', path),
  searchDirectory: (dir, options, maxResults, searchId) => ipcRenderer.invoke('search:directory', dir, options, maxResults, searchId),
  cancelSearch: (searchId) => ipcRenderer.invoke('search:cancel', searchId),
  watchFile: (path) => ipcRenderer.invoke('watch:file', path),
  unwatchFile: (path) => ipcRenderer.invoke('watch:unfile', path),
  getPendingFiles: () => ipcRenderer.invoke('app:getPendingFiles'),
  rendererReady: () => ipcRenderer.invoke('app:rendererReady'),
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  confirm: (message, options) => ipcRenderer.invoke('dialog:confirm', message, options),
  message: (message, options) => ipcRenderer.invoke('dialog:message', message, options),
  revealInFolder: (path) => ipcRenderer.invoke('shell:revealInFolder', path),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:readText'),
  windowShow: () => ipcRenderer.invoke('window:show'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowForceClose: () => ipcRenderer.invoke('window:forceClose'),
  registerDefaultApp: () => ipcRenderer.invoke('app:registerDefaultApp'),
  onFileChanged: (handler) => on('file:changed', handler),
  onOpenFile: (handler) => on('open-file', handler),
  onDragDropEvent: async (handler) => onDragDropEvent(handler),
});
