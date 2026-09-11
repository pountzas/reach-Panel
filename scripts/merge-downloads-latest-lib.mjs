/**
 * Shared helpers for scripts/merge-downloads-latest.mjs
 */

export const DOWNLOADS_LATEST_PATHNAME = 'downloads/latest.json';

export const DOWNLOADS_LATEST_PUBLIC_URL =
  'https://2zhnilo5gijgvtoh.public.blob.vercel-storage.com/downloads/latest.json';

function isNotFoundError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  if (err.status === 404 || err.statusCode === 404) {
    return true;
  }
  if (err.name === 'BlobNotFoundError') {
    return true;
  }
  const code = err.code;
  return code === 'not_found' || code === 'BLOB_NOT_FOUND';
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readTextFromGetResult(result, fetchImpl) {
  if (typeof result === 'string') {
    return result;
  }
  if (result?.stream) {
    return streamToString(result.stream);
  }
  if (typeof result?.text === 'function') {
    return result.text();
  }
  const url =
    typeof result?.downloadUrl === 'string'
      ? result.downloadUrl
      : typeof result?.url === 'string'
        ? result.url
        : null;
  if (url && fetchImpl) {
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (response.ok) {
      return response.text();
    }
  }
  return '';
}

/**
 * Load downloads/latest.json via an injectable get() (from @vercel/blob).
 * Missing / 404 → {}. Empty or unreadable get() results can fall back to the
 * public URL when fetchImpl is provided. Other errors propagate.
 */
export async function loadDownloadsManifest(getFn, pathname, token, fetchImpl) {
  let result;
  try {
    result = await getFn(pathname, { access: 'public', token, useCache: false });
  } catch (err) {
    if (!isNotFoundError(err)) {
      throw err;
    }
    result = null;
  }

  let text = result == null ? '' : await readTextFromGetResult(result, fetchImpl);

  if ((!text || !text.trim()) && fetchImpl) {
    const response = await fetchImpl(`${DOWNLOADS_LATEST_PUBLIC_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (response.ok) {
      text = await response.text();
    }
  }

  if (!text || !text.trim()) {
    return {};
  }

  return JSON.parse(text);
}

export function otherPlatform(platform) {
  return platform === 'windows' ? 'android' : 'windows';
}

/**
 * Keep the other platform when a later load comes back empty or stripped.
 */
export function restoreRememberedPlatform(loaded, rememberedOther, platform) {
  const other = otherPlatform(platform);
  const current = { ...loaded };
  if (rememberedOther && !current[other]) {
    current[other] = rememberedOther;
  }
  return current;
}

export function nextRememberedPlatform(manifest, rememberedOther, platform) {
  const other = otherPlatform(platform);
  return manifest?.[other] ?? rememberedOther;
}

export function hasManifestContent(manifest) {
  return Boolean(
    manifest && (manifest.windows || manifest.android || manifest.updatedAt),
  );
}

/**
 * Merge one platform section. Preserves the other platform. Sets updatedAt.
 * @param {object} current
 * @param {'windows'|'android'} platform
 * @param {object} section
 * @param {() => Date} [now]
 */
export function mergeDownloadsManifest(current, platform, section, now = () => new Date()) {
  if (platform !== 'windows' && platform !== 'android') {
    throw new Error(`Invalid platform: ${platform}`);
  }

  const next = { ...current };

  if (platform === 'windows') {
    next.windows = {
      version: section.version,
      exeUrl: section.exeUrl,
      msiUrl: section.msiUrl,
    };
  } else {
    next.android = {
      version: section.version,
      apkUrl: section.apkUrl,
    };
  }

  next.updatedAt = now().toISOString();
  return next;
}

/**
 * True when a put() raced with another platform writer and should be retried.
 * Empty post-put reads are handled by mergeWriteFollowUp, not here.
 * @param {object} current snapshot loaded before merge
 * @param {object} next merged document we attempted to write
 * @param {object} written snapshot loaded after put
 * @param {'windows'|'android'} platform
 */
export function mergeWriteNeedsRetry(current, next, written, platform) {
  if (JSON.stringify(written?.[platform]) !== JSON.stringify(next?.[platform])) {
    return true;
  }
  const other = otherPlatform(platform);
  return Boolean(current?.[other]) && !written?.[other];
}

/**
 * What the merge loop should do after a post-put read.
 * Empty reads retry until the last attempt, then count as inconclusive success.
 * @returns {'done' | 'retry' | 'inconclusive' | 'conflict'}
 */
export function mergeWriteFollowUp(current, next, written, platform, isLastAttempt) {
  if (!hasManifestContent(written)) {
    return isLastAttempt ? 'inconclusive' : 'retry';
  }
  if (!mergeWriteNeedsRetry(current, next, written, platform)) {
    return 'done';
  }
  return isLastAttempt ? 'conflict' : 'retry';
}

function readFlag(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  return argv[idx + 1];
}

/**
 * Resolve merge CLI/env input. Throws on invalid platform or missing URLs.
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function resolveMergeInput(argv, env) {
  const platform = readFlag(argv, '--platform') || env.PLATFORM;
  const version = readFlag(argv, '--version') || env.VERSION;

  if (platform !== 'windows' && platform !== 'android') {
    throw new Error(`Invalid platform: ${platform ?? '(missing)'}`);
  }
  if (!version) {
    throw new Error('VERSION / --version is required');
  }

  if (platform === 'windows') {
    const exeUrl = readFlag(argv, '--exe-url') || env.EXE_URL;
    const msiUrl = readFlag(argv, '--msi-url') || env.MSI_URL;
    if (!exeUrl || !msiUrl) {
      throw new Error('Windows merge requires --exe-url / EXE_URL and --msi-url / MSI_URL');
    }
    return { platform, version, exeUrl, msiUrl };
  }

  const apkUrl = readFlag(argv, '--apk-url') || env.APK_URL;
  if (!apkUrl) {
    throw new Error('Android merge requires --apk-url / APK_URL');
  }
  return { platform, version, apkUrl };
}
