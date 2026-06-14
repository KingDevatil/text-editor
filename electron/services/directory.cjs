const fs = require('node:fs/promises');
const path = require('node:path');

const ignored = new Set(['.git', 'node_modules', 'target', 'dist', 'build', 'out']);

async function listDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => !ignored.has(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      is_dir: entry.isDirectory(),
    }))
    .sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

module.exports = { ignored, listDirectory };
