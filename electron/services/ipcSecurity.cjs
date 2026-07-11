const path = require('node:path');
const { fileURLToPath } = require('node:url');

function isAllowedRendererUrl(value, { isDev, devServerUrl, entryFile }) {
  try {
    const url = new URL(value);
    if (isDev) return url.origin === new URL(devServerUrl).origin;
    return url.protocol === 'file:' && path.resolve(fileURLToPath(url)) === path.resolve(entryFile);
  } catch {
    return false;
  }
}

module.exports = { isAllowedRendererUrl };
