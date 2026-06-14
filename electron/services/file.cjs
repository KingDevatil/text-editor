const fs = require('node:fs/promises');
const path = require('node:path');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const META_CHUNK_SIZE = 256 * 1024;

const aliases = new Map([
  ['utf-8', 'UTF-8'],
  ['utf8', 'UTF-8'],
  ['utf-16le', 'UTF-16LE'],
  ['utf-16be', 'UTF-16BE'],
  ['gbk', 'GBK'],
  ['gb2312', 'GB2312'],
  ['gb18030', 'GB18030'],
  ['big5', 'BIG5'],
  ['shift_jis', 'Shift-JIS'],
  ['shift-jis', 'Shift-JIS'],
  ['sjis', 'Shift-JIS'],
  ['euc-kr', 'EUC-KR'],
  ['iso-8859-1', 'ISO-8859-1'],
  ['windows-1252', 'Windows-1252'],
]);

function normalizeEncoding(encoding) {
  if (!encoding) return 'UTF-8';
  return aliases.get(String(encoding).toLowerCase()) ?? encoding;
}

function iconvEncoding(encoding) {
  const normalized = normalizeEncoding(encoding);
  if (normalized === 'UTF-8 BOM') return 'utf8';
  if (normalized === 'Shift-JIS') return 'shift_jis';
  return normalized;
}

function detectEncoding(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'UTF-8 BOM', offset: 3 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'UTF-16LE', offset: 2 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: 'UTF-16BE', offset: 2 };
  }
  const detected = jschardet.detect(buffer.slice(0, Math.min(buffer.length, META_CHUNK_SIZE)));
  const normalized = normalizeEncoding(detected.encoding);
  return { encoding: normalized || 'UTF-8', offset: 0 };
}

function decode(buffer, encoding, offset = 0) {
  const body = offset > 0 ? buffer.slice(offset) : buffer;
  return iconv.decode(body, iconvEncoding(encoding));
}

function encode(text, encoding) {
  const normalized = normalizeEncoding(encoding);
  const body = iconv.encode(text, iconvEncoding(normalized));
  if (normalized === 'UTF-8 BOM') {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
  }
  if (normalized === 'UTF-16LE') {
    return Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
  }
  if (normalized === 'UTF-16BE') {
    return Buffer.concat([Buffer.from([0xfe, 0xff]), body]);
  }
  return body;
}

async function readFileAuto(filePath) {
  const buffer = await fs.readFile(filePath);
  const detected = detectEncoding(buffer);
  return {
    text: decode(buffer, detected.encoding, detected.offset),
    encoding: detected.encoding,
  };
}

async function readFileWithEncoding(filePath, encoding) {
  const buffer = await fs.readFile(filePath);
  const normalized = normalizeEncoding(encoding);
  const offset =
    normalized === 'UTF-8 BOM' && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? 3 :
    normalized === 'UTF-16LE' && buffer[0] === 0xff && buffer[1] === 0xfe ? 2 :
    normalized === 'UTF-16BE' && buffer[0] === 0xfe && buffer[1] === 0xff ? 2 :
    0;
  return {
    text: decode(buffer, normalized, offset),
    encoding: normalized,
  };
}

async function readFileMeta(filePath) {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, 'r');
  try {
    const size = Math.min(stat.size, META_CHUNK_SIZE);
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, 0);
    const detected = detectEncoding(buffer);
    const firstChunk = decode(buffer, detected.encoding, detected.offset);
    return {
      file_size: stat.size,
      encoding: detected.encoding,
      total_lines: firstChunk.length === 0 ? 0 : firstChunk.split(/\r\n|\r|\n/).length,
      first_chunk: firstChunk,
    };
  } finally {
    await handle.close();
  }
}

async function writeFile(filePath, content, encoding) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, encode(content, encoding));
  await fs.rename(tmp, filePath);
}

async function renameFile(oldPath, newPath) {
  await fs.rename(oldPath, newPath);
}

module.exports = {
  readFileAuto,
  readFileWithEncoding,
  readFileMeta,
  writeFile,
  renameFile,
};
