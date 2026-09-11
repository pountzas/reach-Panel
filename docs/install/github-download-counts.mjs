/**
 * Sum GitHub Release asset download_count values for the install page CTAs.
 */

export const GITHUB_RELEASES_API_URL =
  "https://api.github.com/repos/pountzas/reach-Panel/releases?per_page=100";

/**
 * @typedef {{ setup: number, msi: number, apk: number }} GithubDownloadCounts
 * @typedef {{ name?: string, download_count?: number }} GithubAsset
 * @typedef {{ assets?: GithubAsset[] }} GithubRelease
 * @typedef {{ textContent: string, hidden: boolean }} CountEl
 */

/**
 * @param {string | undefined} name
 * @returns {"setup" | "msi" | "apk" | null}
 */
export function classifyReleaseAsset(name) {
  if (typeof name !== "string" || name.length === 0) return null;
  const lower = name.toLowerCase();
  if (lower.endsWith(".sig")) return null;
  if (lower.endsWith("-setup.exe")) return "setup";
  if (lower.endsWith(".msi")) return "msi";
  if (lower.endsWith(".apk")) return "apk";
  return null;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function asCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * Prefer versioned companion APKs in a release so the stable pathname copy
 * is not double-counted.
 *
 * @param {GithubAsset[]} assets
 * @returns {number}
 */
function apkDownloadsForRelease(assets) {
  const apks = assets.filter(
    (asset) => classifyReleaseAsset(asset.name) === "apk",
  );
  const versioned = apks.filter(
    (asset) => asset.name !== "ReachPanel-Companion.apk",
  );
  const chosen = versioned.length > 0 ? versioned : apks;
  return chosen.reduce((sum, asset) => sum + asCount(asset.download_count), 0);
}

/**
 * @param {GithubRelease[]} releases
 * @returns {GithubDownloadCounts}
 */
export function sumGithubDownloadCounts(releases) {
  /** @type {GithubDownloadCounts} */
  const totals = { setup: 0, msi: 0, apk: 0 };
  if (!Array.isArray(releases)) return totals;

  for (const release of releases) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    for (const asset of assets) {
      const kind = classifyReleaseAsset(asset.name);
      if (kind === "setup" || kind === "msi") {
        totals[kind] += asCount(asset.download_count);
      }
    }
    totals.apk += apkDownloadsForRelease(assets);
  }

  return totals;
}

/**
 * @param {unknown} count
 * @returns {string | null}
 */
export function formatDownloadCount(count) {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) {
    return null;
  }
  const rounded = Math.floor(count);
  return rounded === 1 ? "1 download" : `${rounded} downloads`;
}

/**
 * @param {string | null | undefined} header
 * @returns {string | null}
 */
export function parseNextLink(header) {
  if (typeof header !== "string" || header.length === 0) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (match) return match[1];
  }
  return null;
}

/**
 * @param {CountEl} el
 * @param {number} count
 */
export function applyCountLabel(el, count) {
  const label = formatDownloadCount(count);
  if (!label) {
    el.textContent = "";
    el.hidden = true;
    return;
  }
  el.textContent = label;
  el.hidden = false;
}

/**
 * @typedef {{ setup: CountEl, msi: CountEl, apk: CountEl }} CountUi
 */

/**
 * @param {CountUi} ui
 * @param {GithubDownloadCounts | null | undefined} counts
 */
export function applyDownloadCounts(ui, counts) {
  applyCountLabel(ui.setup, counts?.setup ?? 0);
  applyCountLabel(ui.msi, counts?.msi ?? 0);
  applyCountLabel(ui.apk, counts?.apk ?? 0);
}

/**
 * @param {ParentNode} root
 * @returns {CountUi | null}
 */
export function readCountUi(root) {
  const setup = root.querySelector("#download-setup-count");
  const msi = root.querySelector("#download-msi-count");
  const apk = root.querySelector("#download-apk-count");
  if (!setup || !msi || !apk) return null;
  return { setup, msi, apk };
}

/**
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [startUrl]
 * @returns {Promise<GithubRelease[] | null>}
 */
export async function fetchAllGithubReleases(
  fetchImpl = fetch,
  startUrl = GITHUB_RELEASES_API_URL,
) {
  try {
    /** @type {GithubRelease[]} */
    const releases = [];
    let url = startUrl;
    const seen = new Set();

    while (url && !seen.has(url)) {
      seen.add(url);
      const response = await fetchImpl(url, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) return null;
      const page = await response.json();
      if (!Array.isArray(page)) return null;
      releases.push(...page);
      url = parseNextLink(response.headers.get("Link"));
    }

    return releases;
  } catch {
    return null;
  }
}
