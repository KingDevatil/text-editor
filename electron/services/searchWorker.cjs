const fs = require('node:fs/promises');
const path = require('node:path');
const { parentPort, workerData } = require('node:worker_threads');
const { ignored } = require('./directory.cjs');
const { readFileAuto } = require('./file.cjs');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const BINARY_SAMPLE_SIZE = 4096;

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function isLikelyBinary(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(BINARY_SAMPLE_SIZE);
    const { bytesRead } = await handle.read(buffer, 0, BINARY_SAMPLE_SIZE, 0);
    for (let i = 0; i < bytesRead; i += 1) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } finally {
    await handle.close();
  }
}

function findMatchesInLine(line, options) {
  const matches = [];
  if (options.regexMode) {
    let re;
    try {
      re = new RegExp(options.query, options.caseSensitive ? 'g' : 'gi');
    } catch {
      return matches;
    }
    let match;
    while ((match = re.exec(line))) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) re.lastIndex += 1;
    }
    return matches;
  }

  const haystack = options.caseSensitive ? line : line.toLowerCase();
  const needle = options.caseSensitive ? options.query : options.query.toLowerCase();
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    matches.push({ start: index, end: index + needle.length });
    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }
  return matches;
}

async function searchDirectory(dir, options, maxResults = 1000) {
  const results = [];
  if (!options.query) return results;

  for await (const filePath of walk(dir)) {
    if (results.length >= maxResults) break;
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_SIZE) continue;

    try {
      if (await isLikelyBinary(filePath)) continue;
    } catch {
      continue;
    }

    let text;
    try {
      text = (await readFileAuto(filePath)).text;
    } catch {
      continue;
    }

    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length && results.length < maxResults; i += 1) {
      for (const match of findMatchesInLine(lines[i], options)) {
        results.push({
          filePath,
          lineNumber: i + 1,
          lineText: lines[i],
          matchStart: match.start,
          matchEnd: match.end,
        });
        if (results.length >= maxResults) break;
      }
    }
  }

  return results;
}

searchDirectory(workerData.dir, workerData.options, workerData.maxResults)
  .then((results) => parentPort?.postMessage({ type: 'done', results }))
  .catch((error) => parentPort?.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }));
