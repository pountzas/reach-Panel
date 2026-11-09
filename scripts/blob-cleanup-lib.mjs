/**
 * Shared helpers for scripts/cleanup-old-apk-blobs.mjs
 */

export const PROTECTED = [
  'ReachPanel-Companion.apk',
  'ReachPanel-Setup.exe',
  'ReachPanel.msi',
  'downloads/latest.json',
];

const LIST_PREFIX = 'ReachPanel-Companion-';

export function isVersionedCompanionApk(pathname) {
  return /^ReachPanel-Companion-\d+\.\d+\.\d+\.apk$/.test(String(pathname));
}

async function listCompanionBlobs(list, token) {
  const blobs = [];
  let cursor;
  for (;;) {
    const page = await list({ prefix: LIST_PREFIX, token, cursor });
    blobs.push(...(page.blobs ?? []));
    if (!page.hasMore || !page.cursor) {
      break;
    }
    cursor = page.cursor;
  }
  return blobs;
}

async function deleteBlobs({ del, token, dryRun }, blobs) {
  const deleted = [];
  for (const blob of blobs) {
    if (PROTECTED.includes(blob.pathname) || !isVersionedCompanionApk(blob.pathname)) {
      continue;
    }
    if (!dryRun) {
      await del(blob.url, { token });
    }
    deleted.push(blob.pathname);
  }
  return { deleted };
}

export async function deletePrevious({ list, del, token, dryRun }, previousVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(String(previousVersion))) {
    throw new Error(`Invalid previous version: ${previousVersion}`);
  }
  const pathname = `ReachPanel-Companion-${previousVersion}.apk`;
  const blobs = await listCompanionBlobs(list, token);
  const target = blobs.find((blob) => blob.pathname === pathname);
  if (!target) {
    return { deleted: [] };
  }
  return deleteBlobs({ del, token, dryRun }, [target]);
}

export async function sweep({ list, del, token, dryRun }) {
  const blobs = await listCompanionBlobs(list, token);
  return deleteBlobs({ del, token, dryRun }, blobs);
}

function readFlag(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  return argv[idx + 1];
}

export function resolveCleanupInput(argv) {
  return {
    previousVersion: readFlag(argv, '--previous-version'),
    sweep: argv.includes('--sweep'),
    dryRun: argv.includes('--dry-run'),
  };
}
