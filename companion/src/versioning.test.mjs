import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testFile = fileURLToPath(import.meta.url);

if (!process.env.VERSIONING_TEST_STRIP_TYPES) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', testFile],
    {
      env: { ...process.env, VERSIONING_TEST_STRIP_TYPES: '1' },
      stdio: 'inherit',
    },
  );
  process.exit(result.status ?? 1);
}

import assert from 'node:assert/strict';
import test from 'node:test';

import { androidVersionCode } from './versioning.ts';

test('androidVersionCode maps semver to Android versionCode', () => {
  assert.equal(androidVersionCode('0.1.0'), 100);
  assert.equal(androidVersionCode('1.2.3'), 10203);
});

test('androidVersionCode rejects minor or patch above 99', () => {
  assert.throws(() => androidVersionCode('1.100.0'), /minor and patch must be <= 99/);
  assert.throws(() => androidVersionCode('1.0.100'), /minor and patch must be <= 99/);
});
