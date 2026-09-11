/**
 * Apply downloads/latest.json to install-page CTA state.
 * Works with real DOM elements or plain stubs in unit tests.
 * Missing or rejected platform URLs keep the HTML fallbacks visible.
 */

const ALLOWED_DOWNLOAD_HOST =
  "2zhnilo5gijgvtoh.public.blob.vercel-storage.com";

/**
 * @typedef {{ href: string, hidden: boolean }} CtaEl
 * @typedef {{ textContent: string }} TextEl
 * @typedef {{ hidden: boolean }} SectionEl
 * @typedef {{ textContent: string, hidden: boolean }} NoteEl
 * @typedef {{
 *   setupCta: CtaEl,
 *   msiCta: CtaEl,
 *   apkCta: CtaEl,
 *   windowsVersion: TextEl,
 *   androidVersion: TextEl,
 *   windowsSection: SectionEl,
 *   androidSection: SectionEl,
 *   statusNote: NoteEl,
 * }} DownloadUi
 *
 * @typedef {{ version?: string, exeUrl?: string, msiUrl?: string }} WindowsManifest
 * @typedef {{ version?: string, apkUrl?: string }} AndroidManifest
 * @typedef {{ windows?: WindowsManifest, android?: AndroidManifest, updatedAt?: string }} DownloadsManifest
 */

/**
 * @param {unknown} value
 * @returns {value is DownloadsManifest}
 */
export function isDownloadsManifest(value) {
  if (value === null || typeof value !== "object") return false;
  return true;
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isAllowedDownloadUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === ALLOWED_DOWNLOAD_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

/**
 * @param {WindowsManifest | undefined} windows
 * @returns {boolean}
 */
function hasWindowsDownloads(windows) {
  return Boolean(
    windows &&
      isAllowedDownloadUrl(windows.exeUrl) &&
      isAllowedDownloadUrl(windows.msiUrl),
  );
}

/**
 * @param {AndroidManifest | undefined} android
 * @returns {boolean}
 */
function hasAndroidDownload(android) {
  return Boolean(android && isAllowedDownloadUrl(android.apkUrl));
}

/**
 * @param {NoteEl} statusNote
 * @param {string} message
 */
function showStatusNote(statusNote, message) {
  statusNote.textContent = message;
  statusNote.hidden = false;
}

/**
 * @param {NoteEl} statusNote
 */
function clearStatusNote(statusNote) {
  statusNote.textContent = "";
  statusNote.hidden = true;
}

/**
 * @param {DownloadUi} ui
 * @param {DownloadsManifest | null | undefined} manifest
 */
export function applyDownloadsManifest(ui, manifest) {
  if (!manifest || !isDownloadsManifest(manifest)) {
    showStatusNote(
      ui.statusNote,
      "Could not load the latest download list. Fallback links below still work, or use Releases on GitHub.",
    );
    return;
  }

  const windowsOk = hasWindowsDownloads(manifest.windows);
  const androidOk = hasAndroidDownload(manifest.android);

  if (!windowsOk && !androidOk) {
    showStatusNote(
      ui.statusNote,
      "Could not load the latest download list. Fallback links below still work, or use Releases on GitHub.",
    );
    return;
  }

  if (windowsOk) {
    ui.setupCta.href = manifest.windows.exeUrl;
    ui.msiCta.href = manifest.windows.msiUrl;
    ui.setupCta.hidden = false;
    ui.msiCta.hidden = false;
    ui.windowsSection.hidden = false;
    if (manifest.windows.version) {
      ui.windowsVersion.textContent = manifest.windows.version;
    }
  }

  if (androidOk) {
    ui.apkCta.href = manifest.android.apkUrl;
    ui.apkCta.hidden = false;
    ui.androidSection.hidden = false;
    if (manifest.android.version) {
      ui.androidVersion.textContent = manifest.android.version;
    }
  }

  if (!windowsOk) {
    showStatusNote(
      ui.statusNote,
      "Windows installers are not listed in the latest manifest yet. Use Releases on GitHub, or try again later.",
    );
    return;
  }

  if (!androidOk) {
    showStatusNote(
      ui.statusNote,
      "The Android APK is not listed in the latest manifest yet. Use Releases on GitHub, or try again later.",
    );
    return;
  }

  clearStatusNote(ui.statusNote);
}

/**
 * @param {ParentNode} root
 * @returns {DownloadUi | null}
 */
export function readDownloadUi(root) {
  const setupCta = root.querySelector("#download-setup");
  const msiCta = root.querySelector("#download-msi");
  const apkCta = root.querySelector("#download-apk");
  const windowsVersion = root.querySelector("#windows-version");
  const androidVersion = root.querySelector("#android-version");
  const windowsSection = root.querySelector("#windows-section");
  const androidSection = root.querySelector("#android-section");
  const statusNote = root.querySelector("#status-note");

  if (
    !setupCta ||
    !msiCta ||
    !apkCta ||
    !windowsVersion ||
    !androidVersion ||
    !windowsSection ||
    !androidSection ||
    !statusNote
  ) {
    return null;
  }

  return {
    setupCta,
    msiCta,
    apkCta,
    windowsVersion,
    androidVersion,
    windowsSection,
    androidSection,
    statusNote,
  };
}

/**
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<DownloadsManifest | null>}
 */
export async function fetchDownloadsManifest(url, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!isDownloadsManifest(data)) return null;
    return data;
  } catch {
    return null;
  }
}
