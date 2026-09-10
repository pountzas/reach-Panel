import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { inferContentType } from './upload-to-blob-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uploadScript = join(root, 'scripts', 'upload-to-blob.mjs');

test('inferContentType maps known extensions', () => {
  assert.equal(
    inferContentType('ReachPanel-Companion.apk'),
    'application/vnd.android.package-archive',
  );
  assert.equal(inferContentType('ReachPanel-Setup.exe'), 'application/x-msdownload');
  assert.equal(inferContentType('ReachPanel.msi'), 'application/octet-stream');
  assert.equal(inferContentType('downloads/latest.json'), 'application/json');
  assert.equal(inferContentType('unknown.bin'), 'application/octet-stream');
});

test('upload CLI exits 1 when BLOB_READ_WRITE_TOKEN is missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blob-upload-'));
  const file = join(dir, 'file.apk');
  writeFileSync(file, 'apk');
  try {
    const env = { ...process.env };
    delete env.BLOB_READ_WRITE_TOKEN;
    const result = spawnSync(process.execPath, [uploadScript, file, 'ReachPanel-Companion.apk'], {
      env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BLOB_READ_WRITE_TOKEN/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('upload CLI exits 1 when local file is missing', () => {
  const result = spawnSync(
    process.execPath,
    [uploadScript, join(tmpdir(), 'no-such-file-blob-upload.apk'), 'ReachPanel-Companion.apk'],
    {
      env: { ...process.env, BLOB_READ_WRITE_TOKEN: 'test-token' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
});
