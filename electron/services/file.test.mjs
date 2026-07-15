import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readFileAuto, renameFile, writeFile } = require('./file.cjs');
const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-file-service-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('file service renameFile', () => {
  it('does not overwrite an existing target', async () => {
    const dir = makeTempDir();
    const source = path.join(dir, 'source.txt');
    const target = path.join(dir, 'target.txt');
    fs.writeFileSync(source, 'source');
    fs.writeFileSync(target, 'target');

    await expect(renameFile(source, target)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(fs.readFileSync(source, 'utf8')).toBe('source');
    expect(fs.readFileSync(target, 'utf8')).toBe('target');
  });

  it('renames when the target does not exist', async () => {
    const dir = makeTempDir();
    const source = path.join(dir, 'source.txt');
    const target = path.join(dir, 'target.txt');
    fs.writeFileSync(source, 'source');

    await renameFile(source, target);
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('source');
  });

  it('removes the old name when the target is already a hard link to the same file', async () => {
    const dir = makeTempDir();
    const source = path.join(dir, 'source.txt');
    const target = path.join(dir, 'target.txt');
    fs.writeFileSync(source, 'shared');
    fs.linkSync(source, target);

    await renameFile(source, target);
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('shared');
  });
});

describe('file service encoding', () => {
  it('promotes detected ASCII to UTF-8 before saving non-ASCII text', async () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'ascii.txt');
    fs.writeFileSync(filePath, 'hello', 'ascii');

    const detected = await readFileAuto(filePath);
    expect(detected.encoding).toBe('UTF-8');

    await writeFile(filePath, 'hello中文', detected.encoding);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello中文');
  });
});
