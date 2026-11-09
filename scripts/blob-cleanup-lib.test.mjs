import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  deletePrevious,
  isVersionedCompanionApk,
  resolveCleanupInput,
  sweep,
} from './blob-cleanup-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cleanupScript = join(root, 'scripts', 'cleanup-old-apk-blobs.mjs');

function blob(pathname) {
  return { pathname, url: `https://blob.example/${pathname}` };
}

const ALL_BLOBS = [
  blob('ReachPanel-Companion.apk'),
  blob('ReachPanel-Setup.exe'),
  blob('ReachPanel.msi'),
  blob('downloads/latest.json'),
  blob('ReachPanel-Companion-0.3.0.apk'),
  blob('ReachPanel-Companion-0.3.1.apk'),
  blob('ReachPanel-Companion-old.apk'),
];

function fakeList(pages) {
  const calls = [];
  let index = 0;
  const list = async (opts) => {
    calls.push(opts);
    const page = pages[index] ?? { blobs: [], hasMore: false };
    index += 1;
    return page;
  };
  list.calls = calls;
  return list;
}

function fakeDel() {
  const calls = [];
  const del = async (url, opts) => {
    calls.push({ url, opts });
  };
  del.calls = calls;
  return del;
}

test('isVersionedCompanionApk is true only for ReachPanel-Companion-<semver>.apk', () => {
  assert.equal(isVersionedCompanionApk('ReachPanel-Companion-0.3.0.apk'), true);
  assert.equal(isVersionedCompanionApk('ReachPanel-Companion-1.2.3.apk'), true);
  assert.equal(isVersionedCompanionApk('ReachPanel-Companion.apk'), false);
  assert.equal(isVersionedCompanionApk('ReachPanel-Companion-old.apk'), false);
  assert.equal(isVersionedCompanionApk('ReachPanel-Companion-0.3.apk'), false);
  assert.equal(isVersionedCompanionApk('ReachPanel-Setup.exe'), false);
});

test("deletePrevious('0.3.0') deletes only that APK's url", async () => {
  const list = fakeList([{ blobs: ALL_BLOBS, hasMore: false }]);
  const del = fakeDel();
  const result = await deletePrevious({ list, del, token: 'tok', dryRun: false }, '0.3.0');
  assert.deepEqual(result, { deleted: ['ReachPanel-Companion-0.3.0.apk'] });
  assert.deepEqual(
    del.calls.map((c) => c.url),
    ['https://blob.example/ReachPanel-Companion-0.3.0.apk'],
  );
  assert.deepEqual(del.calls[0].opts, { token: 'tok' });
});

test('deletePrevious rejects an invalid previous version', async () => {
  const list = fakeList([{ blobs: ALL_BLOBS, hasMore: false }]);
  const del = fakeDel();
  await assert.rejects(
    () => deletePrevious({ list, del, token: 'tok', dryRun: false }, ''),
    /Invalid previous version/,
  );
  assert.deepEqual(del.calls, []);
});

test('deletePrevious is a no-op when the previous version blob is missing', async () => {
  const list = fakeList([{ blobs: ALL_BLOBS, hasMore: false }]);
  const del = fakeDel();
  const result = await deletePrevious({ list, del, token: 'tok', dryRun: false }, '9.9.9');
  assert.deepEqual(result, { deleted: [] });
  assert.deepEqual(del.calls, []);
});

test('sweep deletes only semver Companion APKs', async () => {
  const list = fakeList([{ blobs: ALL_BLOBS, hasMore: false }]);
  const del = fakeDel();
  const result = await sweep({ list, del, token: 'tok', dryRun: false });
  assert.deepEqual(result.deleted.sort(), [
    'ReachPanel-Companion-0.3.0.apk',
    'ReachPanel-Companion-0.3.1.apk',
  ]);
  assert.deepEqual(
    del.calls.map((c) => c.url).sort(),
    [
      'https://blob.example/ReachPanel-Companion-0.3.0.apk',
      'https://blob.example/ReachPanel-Companion-0.3.1.apk',
    ],
  );
  for (const call of del.calls) {
    assert.deepEqual(call.opts, { token: 'tok' });
  }
});

test('sweep leaves protected pathnames and non-semver APKs untouched', async () => {
  const list = fakeList([{ blobs: ALL_BLOBS, hasMore: false }]);
  const del = fakeDel();
  await sweep({ list, del, token: 'tok', dryRun: false });
  const deletedUrls = new Set(del.calls.map((c) => c.url));
  assert.equal(deletedUrls.has('https://blob.example/ReachPanel-Companion.apk'), false);
  assert.equal(deletedUrls.has('https://blob.example/ReachPanel-Setup.exe'), false);
  assert.equal(deletedUrls.has('https://blob.example/ReachPanel.msi'), false);
  assert.equal(deletedUrls.has('https://blob.example/downloads/latest.json'), false);
  assert.equal(deletedUrls.has('https://blob.example/ReachPanel-Companion-old.apk'), false);
});

test('sweep follows list pagination cursor across two pages', async () => {
  const list = fakeList([
    {
      blobs: [blob('ReachPanel-Companion.apk'), blob('ReachPanel-Companion-0.3.0.apk')],
      hasMore: true,
      cursor: 'page-2',
    },
    {
      blobs: [blob('ReachPanel-Companion-0.3.1.apk'), blob('ReachPanel-Companion-old.apk')],
      hasMore: false,
    },
  ]);
  const del = fakeDel();
  const result = await sweep({ list, del, token: 'tok', dryRun: false });
  assert.deepEqual(result.deleted.sort(), [
    'ReachPanel-Companion-0.3.0.apk',
    'ReachPanel-Companion-0.3.1.apk',
  ]);
  assert.equal(list.calls.length, 2);
  assert.equal(list.calls[0].prefix, 'ReachPanel-Companion-');
  assert.equal(list.calls[0].token, 'tok');
  assert.equal(list.calls[1].cursor, 'page-2');
  assert.equal(list.calls[1].token, 'tok');
});

test('dry-run sweep reports pathnames but never calls del', async () => {
  const list = fakeList([{ blobs: ALL_BLOBS, hasMore: false }]);
  const del = fakeDel();
  const result = await sweep({ list, del, token: 'tok', dryRun: true });
  assert.deepEqual(result.deleted.sort(), [
    'ReachPanel-Companion-0.3.0.apk',
    'ReachPanel-Companion-0.3.1.apk',
  ]);
  assert.deepEqual(del.calls, []);
  assert.equal(list.calls.length, 1);
});

test("dry-run deletePrevious reports the pathname but never calls del", async () => {
  const list = fakeList([{ blobs: ALL_BLOBS, hasMore: false }]);
  const del = fakeDel();
  const result = await deletePrevious({ list, del, token: 'tok', dryRun: true }, '0.3.0');
  assert.deepEqual(result, { deleted: ['ReachPanel-Companion-0.3.0.apk'] });
  assert.deepEqual(del.calls, []);
});

test('resolveCleanupInput reads --previous-version, --sweep, and --dry-run', () => {
  assert.deepEqual(resolveCleanupInput(['--previous-version', '0.3.0']), {
    previousVersion: '0.3.0',
    sweep: false,
    dryRun: false,
  });
  assert.deepEqual(resolveCleanupInput(['--sweep', '--dry-run']), {
    previousVersion: undefined,
    sweep: true,
    dryRun: true,
  });
  assert.deepEqual(
    resolveCleanupInput(['--previous-version', '0.3.0', '--sweep', '--dry-run']),
    {
      previousVersion: '0.3.0',
      sweep: true,
      dryRun: true,
    },
  );
});

test('cleanup CLI exits 1 when BLOB_READ_WRITE_TOKEN is missing', () => {
  const env = { ...process.env };
  delete env.BLOB_READ_WRITE_TOKEN;
  const result = spawnSync(process.execPath, [cleanupScript, '--sweep'], {
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOB_READ_WRITE_TOKEN/);
});

test('cleanup CLI exits 1 when neither --previous-version nor --sweep is set', () => {
  const result = spawnSync(process.execPath, [cleanupScript], {
    env: { ...process.env, BLOB_READ_WRITE_TOKEN: 'test-token' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
