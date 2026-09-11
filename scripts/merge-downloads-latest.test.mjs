import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DOWNLOADS_LATEST_PUBLIC_URL,
  loadDownloadsManifest,
  mergeDownloadsManifest,
  mergeWriteFollowUp,
  mergeWriteNeedsRetry,
  restoreRememberedPlatform,
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

test('mergeWriteNeedsRetry is false when our section landed and the other platform remains', () => {
  const current = {
    android: { version: '0.3.0', apkUrl: 'https://example.com/apk' },
  };
  const next = {
    android: current.android,
    windows: {
      version: '0.12.0',
      exeUrl: 'https://example.com/exe',
      msiUrl: 'https://example.com/msi',
    },
    updatedAt: '2026-09-11T00:00:00.000Z',
  };
  assert.equal(mergeWriteNeedsRetry(current, next, next, 'windows'), false);
});

test('mergeWriteNeedsRetry is true when a concurrent writer dropped the other platform', () => {
  const current = {
    android: { version: '0.3.0', apkUrl: 'https://example.com/apk' },
  };
  const next = {
    android: current.android,
    windows: {
      version: '0.12.0',
      exeUrl: 'https://example.com/exe',
      msiUrl: 'https://example.com/msi',
    },
  };
  const written = {
    windows: next.windows,
    updatedAt: '2026-09-11T00:00:00.000Z',
  };
  assert.equal(mergeWriteNeedsRetry(current, next, written, 'windows'), true);
});

test('mergeWriteNeedsRetry is true when our platform section is missing after put', () => {
  const current = {};
  const next = {
    windows: {
      version: '0.12.0',
      exeUrl: 'https://example.com/exe',
      msiUrl: 'https://example.com/msi',
    },
  };
  const written = {
    android: { version: '0.3.0', apkUrl: 'https://example.com/apk' },
  };
  assert.equal(mergeWriteNeedsRetry(current, next, written, 'windows'), true);
});

test('empty post-put read retries before the final attempt', () => {
  const current = {
    android: { version: '0.3.0', apkUrl: 'https://example.com/apk' },
  };
  const next = {
    android: current.android,
    windows: {
      version: '0.12.0',
      exeUrl: 'https://example.com/exe',
      msiUrl: 'https://example.com/msi',
    },
  };
  const written = {};
  assert.equal(mergeWriteFollowUp(current, next, written, 'windows', false), 'retry');
  assert.equal(mergeWriteFollowUp(current, next, written, 'windows', true), 'inconclusive');
});

test('restoreRememberedPlatform keeps android when a later load is empty', () => {
  const remembered = { version: '0.3.0', apkUrl: 'https://example.com/apk' };
  const restored = restoreRememberedPlatform({}, remembered, 'windows');
  assert.deepEqual(restored.android, remembered);
});

test('restoreRememberedPlatform prefers a freshly loaded other platform', () => {
  const remembered = { version: '0.3.0', apkUrl: 'https://example.com/apk' };
  const loaded = {
    android: { version: '0.3.1', apkUrl: 'https://example.com/apk-new' },
  };
  const restored = restoreRememberedPlatform(loaded, remembered, 'windows');
  assert.deepEqual(restored.android, loaded.android);
});

test('loadDownloadsManifest falls back to the public URL when get returns null', async () => {
  const android = { version: '0.3.0', apkUrl: 'https://example.com/apk' };
  const get = async () => null;
  const fetchImpl = async (url) => {
    assert.match(String(url), new RegExp(DOWNLOADS_LATEST_PUBLIC_URL.replaceAll('.', '\\.')));
    return {
      ok: true,
      text: async () => JSON.stringify({ android }),
    };
  };
  const manifest = await loadDownloadsManifest(get, 'downloads/latest.json', 'tok', fetchImpl);
  assert.deepEqual(manifest.android, android);
});

test('loadDownloadsManifest reads result.url when stream/text are missing', async () => {
  const windows = {
    version: '0.13.1',
    exeUrl: 'https://example.com/exe',
    msiUrl: 'https://example.com/msi',
  };
  const get = async () => ({ url: 'https://blob.example/downloads/latest.json' });
  const fetchImpl = async (url) => {
    assert.equal(url, 'https://blob.example/downloads/latest.json');
    return {
      ok: true,
      text: async () => JSON.stringify({ windows }),
    };
  };
  const manifest = await loadDownloadsManifest(get, 'downloads/latest.json', 'tok', fetchImpl);
  assert.deepEqual(manifest.windows, windows);
});

test('resolveMergeInput throws when windows URLs are missing', () => {
  assert.throws(
    () =>
      resolveMergeInput(['--platform', 'windows', '--version', '0.12.0'], {}),
    /exe|msi/i,
  );
});
