import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  bumpVersion,
  parseVersion,
  resolveBumpType,
  writeVersion,
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

test('resolveBumpType BREAKING CHANGE footer → major', () => {
  assert.equal(
    resolveBumpType(['feat: new protocol\n\nBREAKING CHANGE: drop v1 frames']),
    'major',
  );
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

test('writeVersion updates package.json and both lockfile root versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'companion-bump-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/versioning.cjs'), "const VERSION = '0.2.0';\n");
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'reachpanel-companion', version: '0.2.0' }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'package-lock.json'),
    `${JSON.stringify(
      {
        name: 'reachpanel-companion',
        version: '0.2.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'reachpanel-companion', version: '0.2.0' },
        },
      },
      null,
      2,
    )}\n`,
  );

  try {
    writeVersion(root, '0.3.0');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    assert.equal(readFileSync(join(root, 'src/versioning.cjs'), 'utf8').includes("const VERSION = '0.3.0'"), true);
    assert.equal(pkg.version, '0.3.0');
    assert.equal(lock.version, '0.3.0');
    assert.equal(lock.packages[''].version, '0.3.0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
