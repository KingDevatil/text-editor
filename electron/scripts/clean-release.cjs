const fs = require('node:fs');
const path = require('node:path');

const releaseDir = path.resolve(__dirname, '..', '..', 'release');

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    fs.rmSync(releaseDir, { recursive: true, force: true });
    process.exit(0);
  } catch (error) {
    if (attempt < 3) {
      sleep(1000 * attempt);
      continue;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to remove ${releaseDir}. Close any running packaged app or Explorer window using it, then retry.`);
    console.error(message);
    process.exit(1);
  }
}
