/**
 * Shared helpers for scripts/upload-to-blob.mjs
 */

export function inferContentType(pathname) {
  const lower = String(pathname).toLowerCase();
  if (lower.endsWith('.apk')) {
    return 'application/vnd.android.package-archive';
  }
  if (lower.endsWith('.exe')) {
    return 'application/x-msdownload';
  }
  if (lower.endsWith('.msi')) {
    return 'application/octet-stream';
  }
  if (lower.endsWith('.json')) {
    return 'application/json';
  }
  return 'application/octet-stream';
}

export function buildPutOptions({ size, contentType, token }) {
  return {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    token,
    multipart: size > 4 * 1024 * 1024,
  };
}
