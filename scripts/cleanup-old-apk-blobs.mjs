#!/usr/bin/env node
/**
 * Delete old versioned Companion APK blobs.
 *
 * Usage:
 *   node scripts/cleanup-old-apk-blobs.mjs --previous-version <semver> [--dry-run]
 *   node scripts/cleanup-old-apk-blobs.mjs --sweep [--dry-run]
 *
 * Env:
 *   BLOB_READ_WRITE_TOKEN — required
 *
 * Deleted (or would-delete) pathnames go to stderr.
 */
import { del, list } from '@vercel/blob';

import {
  deletePrevious,
  resolveCleanupInput,
  sweep,
} from './blob-cleanup-lib.mjs';

const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN is required');
  process.exit(1);
}

const input = resolveCleanupInput(process.argv.slice(2));

if (!input.previousVersion && !input.sweep) {
  console.error(
    'Usage: node scripts/cleanup-old-apk-blobs.mjs --previous-version <semver> | --sweep [--dry-run]',
  );
  process.exit(1);
}

const deps = { list, del, token, dryRun: input.dryRun };
const verb = input.dryRun ? 'Would delete' : 'Deleted';

if (input.previousVersion) {
  const result = await deletePrevious(deps, input.previousVersion);
  for (const pathname of result.deleted) {
    console.error(`${verb} ${pathname}`);
  }
}

if (input.sweep) {
  const result = await sweep(deps);
  for (const pathname of result.deleted) {
    console.error(`${verb} ${pathname}`);
  }
}
