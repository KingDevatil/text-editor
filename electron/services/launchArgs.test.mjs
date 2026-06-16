import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { collectFileArgs } = require('./launchArgs.cjs');

describe('collectFileArgs', () => {
  it('ignores the app executable from Windows file-association argv', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-launch-'));
    const exe = path.join(dir, 'Text Editor.exe');
    const file = path.join(dir, 'event_item.txt');
    fs.writeFileSync(exe, 'fake exe');
    fs.writeFileSync(file, 'content');

    expect(collectFileArgs([exe, file], { executablePath: exe })).toEqual([path.resolve(file)]);
  });

  it('ignores flags and directories', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'te-launch-'));
    const file = path.join(dir, 'note.txt');
    fs.writeFileSync(file, 'content');

    expect(collectFileArgs(['--some-flag', dir, file], { executablePath: path.join(dir, 'Text Editor.exe') })).toEqual([
      path.resolve(file),
    ]);
  });
});
