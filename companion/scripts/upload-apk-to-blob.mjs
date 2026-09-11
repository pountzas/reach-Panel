#!/usr/bin/env node
/**
 * Upload an APK to Vercel Blob with a stable pathname (overwrite enabled).
 *
 * Resolves @vercel/blob from companion/node_modules so Android CI
 * (npm ci in companion/ only) can upload without the root package tree.
 *
 * Usage:
 *   node companion/scripts/upload-apk-to-blob.mjs <local-file> [pathname]
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN — required
 *
 * Progress goes to stderr. The public blob URL is the last line of stdout.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { put } from '@vercel/blob';

import { buildPutOptions } from '../../scripts/upload-to-blob-lib.mjs';

const localPath = process.argv[2];
const pathname = process.argv[3] || 'ReachPanel-Companion.apk';
const token = process.env.BLOB_READ_WRITE_TOKEN;
const contentType = 'application/vnd.android.package-archive';

if (!localPath) {
  console.error('Usage: node companion/scripts/upload-apk-to-blob.mjs <local-file> [pathname]');
  process.exit(1);
}

if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is required');
  process.exit(1);
}

let info;
try {
  info = await stat(localPath);
} catch {
  console.error(`Not a file: ${localPath}`);
  process.exit(1);
}

if (!info.isFile()) {
  console.error(`Not a file: ${localPath}`);
  process.exit(1);
}

console.error(`Uploading ${pathname} (${info.size} bytes)...`);

const blob = await put(
  pathname,
  createReadStream(localPath),
  buildPutOptions({ size: info.size, contentType, token }),
);

console.error(`Uploaded ${pathname} (${info.size} bytes)`);
console.log(blob.url);
