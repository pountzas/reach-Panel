#!/usr/bin/env node
/**
 * Merge one platform section into Blob downloads/latest.json.
 *
 * Usage:
 *   node scripts/merge-downloads-latest.mjs --platform windows|android --version <semver> ...
 *
 * Env (or flags):
 *   BLOB_READ_WRITE_TOKEN — required
 *   PLATFORM / --platform
 *   VERSION / --version
 *   windows: EXE_URL / --exe-url, MSI_URL / --msi-url
 *   android: APK_URL / --apk-url
 *
 * Prints the written public URL as the last line of stdout.
 */
import { get, put } from '@vercel/blob';

import {
  DOWNLOADS_LATEST_PATHNAME,
  loadDownloadsManifest,
  mergeDownloadsManifest,
  resolveMergeInput,
} from './merge-downloads-latest-lib.mjs';

const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is required');
  process.exit(1);
}

let input;
try {
  input = resolveMergeInput(process.argv.slice(2), process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const section =
  input.platform === 'windows'
    ? { version: input.version, exeUrl: input.exeUrl, msiUrl: input.msiUrl }
    : { version: input.version, apkUrl: input.apkUrl };

let current;
try {
  current = await loadDownloadsManifest(get, DOWNLOADS_LATEST_PATHNAME, token);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const next = mergeDownloadsManifest(current, input.platform, section);
const body = `${JSON.stringify(next, null, 2)}\n`;

console.error(`Writing ${DOWNLOADS_LATEST_PATHNAME} (${input.platform} ${input.version})...`);

let blob;
try {
  blob = await put(DOWNLOADS_LATEST_PATHNAME, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    token,
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.error(`Updated ${DOWNLOADS_LATEST_PATHNAME}`);
console.log(blob.url);
