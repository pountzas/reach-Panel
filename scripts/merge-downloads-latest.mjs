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
import { get, put } from "@vercel/blob";

import {
  DOWNLOADS_LATEST_PATHNAME,
  MERGE_MAX_ATTEMPTS,
  loadDownloadsManifest,
  mergeDownloadsManifest,
  mergeRetryDelayMs,
  mergeWriteFollowUp,
  nextRememberedPlatform,
  resolveMergeInput,
  restoreRememberedPlatform,
} from "./merge-downloads-latest-lib.mjs";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN is required");
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
  input.platform === "windows"
    ? { version: input.version, exeUrl: input.exeUrl, msiUrl: input.msiUrl }
    : { version: input.version, apkUrl: input.apkUrl };

console.error(
  `Writing ${DOWNLOADS_LATEST_PATHNAME} (${input.platform} ${input.version})...`,
);

let blob;
let rememberedOther;
try {
  for (let attempt = 0; attempt < MERGE_MAX_ATTEMPTS; attempt++) {
    const loaded = await loadDownloadsManifest(
      get,
      DOWNLOADS_LATEST_PATHNAME,
      token,
      fetch,
    );
    const current = restoreRememberedPlatform(
      loaded,
      rememberedOther,
      input.platform,
    );
    rememberedOther = nextRememberedPlatform(
      current,
      rememberedOther,
      input.platform,
    );
    const next = mergeDownloadsManifest(current, input.platform, section);
    rememberedOther = nextRememberedPlatform(
      next,
      rememberedOther,
      input.platform,
    );
    const body = `${JSON.stringify(next, null, 2)}\n`;
    blob = await put(DOWNLOADS_LATEST_PATHNAME, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token,
    });
    await sleep(mergeRetryDelayMs(attempt));
    // Verify via authenticated get only — public CDN can lag and look like a lost race.
    const written = await loadDownloadsManifest(
      get,
      DOWNLOADS_LATEST_PATHNAME,
      token,
      fetch,
      { allowPublicFallback: false },
    );
    rememberedOther = nextRememberedPlatform(
      written,
      rememberedOther,
      input.platform,
    );
    const followUp = mergeWriteFollowUp(
      current,
      next,
      written,
      input.platform,
      attempt === MERGE_MAX_ATTEMPTS - 1,
    );
    if (followUp === "retry") {
      console.error(
        `Merge verify retry ${attempt + 1}/${MERGE_MAX_ATTEMPTS} for ${input.platform}`,
      );
      continue;
    }
    if (followUp === "inconclusive") {
      console.error(
        `Post-write read of ${DOWNLOADS_LATEST_PATHNAME} was inconclusive; treating put as success`,
      );
    } else if (followUp === "conflict") {
      throw new Error(
        `Concurrent update to ${DOWNLOADS_LATEST_PATHNAME} overwrote ${input.platform} after ${MERGE_MAX_ATTEMPTS} attempts`,
      );
    }
    break;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.error(`Updated ${DOWNLOADS_LATEST_PATHNAME}`);
console.log(blob.url);
