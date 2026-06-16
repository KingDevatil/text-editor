const fs = require('node:fs');
const path = require('node:path');

function samePath(a, b) {
  if (!a || !b) return false;
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function collectFileArgs(argv, options = {}) {
  const executablePath = options.executablePath || process.execPath;
  return argv
    .filter((arg) => typeof arg === 'string' && arg.length > 0)
    .filter((arg) => !arg.startsWith('-'))
    .filter((arg) => !samePath(arg, executablePath))
    .filter((arg) => fs.existsSync(arg))
    .filter((arg) => {
      try {
        return fs.statSync(arg).isFile();
      } catch {
        return false;
      }
    })
    .map((arg) => path.resolve(arg));
}

module.exports = { collectFileArgs };
