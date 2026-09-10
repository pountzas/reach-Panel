import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const dir = dirname(fileURLToPath(import.meta.url));
const wrapperPath = join(dir, 'upload-apk-to-blob.mjs');
const source = readFileSync(wrapperPath, 'utf8');

test('APK wrapper imports @vercel/blob directly (companion resolution)', () => {
  assert.match(source, /import\s*\{[^}]*\bput\b[^}]*\}\s*from\s*['"]@vercel\/blob['"]/);
});

test('APK wrapper does not spawn root upload-to-blob.mjs', () => {
  assert.doesNotMatch(source, /spawnSync/);
  assert.doesNotMatch(source, /upload-to-blob\.mjs/);
});

test('APK wrapper uses pure helpers from upload-to-blob-lib', () => {
  assert.match(source, /upload-to-blob-lib\.mjs/);
  assert.match(source, /\bbuildPutOptions\b/);
});
