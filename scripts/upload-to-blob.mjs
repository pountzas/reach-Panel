#!/usr/bin/env node
/**
 * Upload a file to Vercel Blob with a stable pathname (overwrite enabled).
 *
 * Usage:
 *   node scripts/upload-to-blob.mjs <localPath> <pathname> [contentType]
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN — required
 *
 * Progress goes to stderr. The public blob URL is the last line of stdout.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { put } from '@vercel/blob';

import { buildPutOptions, inferContentType } from './upload-to-blob-lib.mjs';

const localPath = process.argv[2];
const pathname = process.argv[3];
const contentTypeArg = process.argv[4];
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!localPath || !pathname) {
  console.error('Usage: node scripts/upload-to-blob.mjs <localPath> <pathname> [contentType]');
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

const contentType = contentTypeArg || inferContentType(pathname);

console.error(`Uploading ${pathname} (${info.size} bytes)...`);

const blob = await put(
  pathname,
  createReadStream(localPath),
  buildPutOptions({ size: info.size, contentType, token }),
);

console.error(`Uploaded ${pathname} (${info.size} bytes)`);
console.log(blob.url);
