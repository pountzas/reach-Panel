#!/usr/bin/env node
/**
 * Upload an APK to Vercel Blob with a stable pathname (overwrite enabled).
 *
 * Thin wrapper around scripts/upload-to-blob.mjs for existing CI callers.
 *
 * Usage:
 *   node companion/scripts/upload-apk-to-blob.mjs <local-file> [pathname]
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN — required
 *
 * Prints the public blob URL to stdout (last line).
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const localPath = process.argv[2];
const pathname = process.argv[3] || 'ReachPanel-Companion.apk';

if (!localPath) {
  console.error('Usage: node companion/scripts/upload-apk-to-blob.mjs <local-file> [pathname]');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const uploadScript = join(root, 'scripts', 'upload-to-blob.mjs');
const contentType = 'application/vnd.android.package-archive';

const result = spawnSync(
  process.execPath,
  [uploadScript, localPath, pathname, contentType],
  {
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

if (result.stderr) {
  process.stderr.write(result.stderr);
}
if (result.stdout) {
  process.stdout.write(result.stdout);
}

process.exit(result.status ?? 1);
