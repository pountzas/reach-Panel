/**
 * Shared helpers for scripts/merge-downloads-latest.mjs
 */

export const DOWNLOADS_LATEST_PATHNAME = 'downloads/latest.json';

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

/**
 * Load downloads/latest.json via an injectable get() (from @vercel/blob).
 * Missing / 404 → {}. Other errors propagate.
 */
export async function loadDownloadsManifest(getFn, pathname, token) {
  let result;
  try {
    result = await getFn(pathname, { access: 'public', token, useCache: false });
  } catch (err) {
    if (isNotFoundError(err)) {
      return {};
    }
    throw err;
  }

  if (result == null) {
    return {};
  }

  let text;
  if (typeof result === 'string') {
    text = result;
  } else if (result.stream) {
    text = await streamToString(result.stream);
  } else if (typeof result.text === 'function') {
    text = await result.text();
  } else if (result.statusCode === 304) {
    return {};
  } else {
    return {};
  }

  if (!text || !text.trim()) {
    return {};
  }

  return JSON.parse(text);
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
 * @param {object} current snapshot loaded before merge
 * @param {object} next merged document we attempted to write
 * @param {object} written snapshot loaded after put
 * @param {'windows'|'android'} platform
 */
export function mergeWriteNeedsRetry(current, next, written, platform) {
  if (JSON.stringify(written?.[platform]) !== JSON.stringify(next?.[platform])) {
    return true;
  }
  const other = platform === 'windows' ? 'android' : 'windows';
  return Boolean(current?.[other]) && !written?.[other];
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
