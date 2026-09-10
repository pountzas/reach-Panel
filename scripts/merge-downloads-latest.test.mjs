import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadDownloadsManifest,
  mergeDownloadsManifest,
  resolveMergeInput,
} from './merge-downloads-latest-lib.mjs';

test('loadDownloadsManifest returns {} on 404', async () => {
  const notFound = Object.assign(new Error('Not Found'), { status: 404 });
  const get = async () => {
    throw notFound;
  };
  const manifest = await loadDownloadsManifest(get, 'downloads/latest.json', 'tok');
  assert.deepEqual(manifest, {});
});

test('loadDownloadsManifest returns {} when get returns null', async () => {
  const get = async () => null;
  const manifest = await loadDownloadsManifest(get, 'downloads/latest.json', 'tok');
  assert.deepEqual(manifest, {});
});

test('mergeDownloadsManifest merges android without wiping windows', () => {
  const current = {
    windows: {
      version: '0.12.0',
      exeUrl: 'https://example.com/exe',
      msiUrl: 'https://example.com/msi',
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const merged = mergeDownloadsManifest(
    current,
    'android',
    { version: '0.3.0', apkUrl: 'https://example.com/apk' },
    () => new Date('2026-09-08T00:00:00.000Z'),
  );
  assert.deepEqual(merged.windows, current.windows);
  assert.deepEqual(merged.android, {
    version: '0.3.0',
    apkUrl: 'https://example.com/apk',
  });
  assert.equal(merged.updatedAt, '2026-09-08T00:00:00.000Z');
});

test('mergeDownloadsManifest merges windows without wiping android', () => {
  const current = {
    android: { version: '0.3.0', apkUrl: 'https://example.com/apk' },
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const merged = mergeDownloadsManifest(
    current,
    'windows',
    {
      version: '0.12.0',
      exeUrl: 'https://example.com/exe',
      msiUrl: 'https://example.com/msi',
    },
    () => new Date('2026-09-08T00:00:00.000Z'),
  );
  assert.deepEqual(merged.android, current.android);
  assert.deepEqual(merged.windows, {
    version: '0.12.0',
    exeUrl: 'https://example.com/exe',
    msiUrl: 'https://example.com/msi',
  });
  assert.equal(merged.updatedAt, '2026-09-08T00:00:00.000Z');
});

test('mergeDownloadsManifest rejects invalid platform', () => {
  assert.throws(
    () => mergeDownloadsManifest({}, 'ios', { version: '1.0.0' }),
    /platform/i,
  );
});

test('resolveMergeInput reads CLI flags for windows', () => {
  const input = resolveMergeInput(
    [
      '--platform',
      'windows',
      '--version',
      '0.12.0',
      '--exe-url',
      'https://example.com/exe',
      '--msi-url',
      'https://example.com/msi',
    ],
    {},
  );
  assert.deepEqual(input, {
    platform: 'windows',
    version: '0.12.0',
    exeUrl: 'https://example.com/exe',
    msiUrl: 'https://example.com/msi',
  });
});

test('resolveMergeInput falls back to env for android', () => {
  const input = resolveMergeInput([], {
    PLATFORM: 'android',
    VERSION: '0.3.0',
    APK_URL: 'https://example.com/apk',
  });
  assert.deepEqual(input, {
    platform: 'android',
    version: '0.3.0',
    apkUrl: 'https://example.com/apk',
  });
});

test('resolveMergeInput throws when windows URLs are missing', () => {
  assert.throws(
    () =>
      resolveMergeInput(['--platform', 'windows', '--version', '0.12.0'], {}),
    /exe|msi/i,
  );
});
