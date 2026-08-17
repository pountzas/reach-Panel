#!/usr/bin/env node
/**
 * Upload an APK to Vercel Blob with a stable pathname (overwrite enabled).
 *
 * Usage:
 *   node companion/scripts/upload-apk-to-blob.mjs <local-file> [pathname]
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN — required
 *
 * Prints the public blob URL to stdout (last line).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { put } from '@vercel/blob';

const localPath = process.argv[2];
const pathname = process.argv[3] || 'ReachPanel-Companion.apk';
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!localPath) {
  console.error('Usage: node companion/scripts/upload-apk-to-blob.mjs <local-file> [pathname]');
  process.exit(1);
}

if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is required');
  process.exit(1);
}

const info = await stat(localPath);
if (!info.isFile()) {
  console.error(`Not a file: ${localPath}`);
  process.exit(1);
}

const blob = await put(pathname, createReadStream(localPath), {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: 'application/vnd.android.package-archive',
  token,
  multipart: info.size > 4 * 1024 * 1024,
});

console.error(`Uploaded ${pathname} (${info.size} bytes)`);
console.log(blob.url);
