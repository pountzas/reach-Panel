import assert from 'node:assert/strict';
import test from 'node:test';

import { androidVersionCode } from './versioning.cjs';

test('androidVersionCode maps semver to Android versionCode', () => {
  assert.equal(androidVersionCode('0.1.0'), 100);
  assert.equal(androidVersionCode('1.2.3'), 10203);
});

test('androidVersionCode rejects minor or patch above 99', () => {
  assert.throws(() => androidVersionCode('1.100.0'), /minor and patch must be <= 99/);
  assert.throws(() => androidVersionCode('1.0.100'), /minor and patch must be <= 99/);
});
