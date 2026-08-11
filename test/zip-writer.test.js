import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip } from '../core/docx/zip-writer.js';

test('createZip дає валідний архів (unzip -t)', () => {
  const buf = createZip([
    { path: 'hello.txt', content: 'Привіт, світ!' },
    { path: 'dir/data.xml', content: '<a>1</a>' },
  ]);
  assert.equal(buf[0], 0x50); // 'P'
  assert.equal(buf[1], 0x4b); // 'K'
  const dir = mkdtempSync(join(tmpdir(), 'ziptest-'));
  const file = join(dir, 't.zip');
  writeFileSync(file, buf);
  const out = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
  assert.match(out, /No errors detected/);
});
