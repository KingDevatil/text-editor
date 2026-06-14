const fs = require('node:fs');
const path = require('node:path');

const releaseDir = path.resolve(__dirname, '..', '..', 'release');

try {
  fs.rmSync(releaseDir, { recursive: true, force: true });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to remove ${releaseDir}. Close any running packaged app or Explorer window using it, then retry.`);
  console.error(message);
  process.exit(1);
}
