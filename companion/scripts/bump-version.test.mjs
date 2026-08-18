import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bumpVersion,
  parseVersion,
  resolveBumpType,
} from './bump-version-lib.mjs';

test('parseVersion accepts semver', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3 });
});

test('bumpVersion patch/minor/major', () => {
  assert.equal(bumpVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(bumpVersion('0.1.0', 'minor'), '0.2.0');
  assert.equal(bumpVersion('0.1.0', 'major'), '1.0.0');
});

test('resolveBumpType feat → minor', () => {
  assert.equal(resolveBumpType(['feat: add companion bridge']), 'minor');
});

test('resolveBumpType fix → patch', () => {
  assert.equal(resolveBumpType(['fix: reconnect after sleep']), 'patch');
});

test('resolveBumpType release → minor', () => {
  assert.equal(resolveBumpType(['release: ship companion APK']), 'minor');
});

test('resolveBumpType BREAKING → major', () => {
  assert.equal(resolveBumpType(['feat!: drop legacy protocol']), 'major');
  assert.equal(resolveBumpType(['BREAKING: remove v1 protocol']), 'major');
});

test('resolveBumpType chore/docs only → null', () => {
  assert.equal(resolveBumpType(['chore: update deps', 'docs: readme']), null);
});

test('resolveBumpType fix after feat stays minor', () => {
  assert.equal(
    resolveBumpType(['feat: new panel', 'fix: typo']),
    'minor',
  );
});
