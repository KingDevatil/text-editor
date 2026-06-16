const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = ['electron-builder', ...process.argv.slice(2)];

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeWithRetry(targetPath) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (attempt === 3) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to remove ${targetPath}: ${message}`);
        return false;
      }
      sleep(1000 * attempt);
    }
  }
  return false;
}

function cleanPartialOutputs() {
  const releaseDir = path.resolve(__dirname, '..', '..', 'release');
  if (!fs.existsSync(releaseDir)) return;

  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith('-unpacked') && !entry.name.endsWith('-unpacked.tmp')) continue;
    removeWithRetry(path.join(releaseDir, entry.name));
  }
}

function runBuilder() {
  return new Promise((resolve) => {
    const child = spawn('npx', args, {
      shell: process.platform === 'win32',
      stdio: ['inherit', 'inherit', 'inherit'],
    });

    child.on('error', (error) => {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      process.stderr.write(`${message}\n`);
      resolve({ status: 1 });
    });

    child.on('close', (status) => {
      resolve({
        status: typeof status === 'number' ? status : 1,
      });
    });
  });
}

async function main() {
  cleanPartialOutputs();
  const result = await runBuilder();
  process.exit(result.status);
}

main();
