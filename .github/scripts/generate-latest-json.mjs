import fs from "node:fs";
import path from "node:path";

const tag = process.env.RELEASE_TAG;
if (!tag) {
  console.error("RELEASE_TAG is required");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const repo = process.env.GITHUB_REPOSITORY ?? "pountzas/reach-Panel";
const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;

/** Match GitHub release asset names (Tauri replaces spaces with dots in bundle filenames). */
function releaseAssetName(filePath) {
  return path.basename(filePath).replace(/ /g, ".");
}

function readSignature(sigPath) {
  return fs.readFileSync(sigPath, "utf8").trim();
}

function addPlatform(platforms, platformKey, installerPath, sigPath) {
  if (!installerPath || !sigPath) {
    return;
  }
  platforms[platformKey] = {
    url: `${baseUrl}/${encodeURIComponent(releaseAssetName(installerPath))}`,
    signature: readSignature(sigPath),
  };
}

const platforms = {};

// Bare key: fallback for older clients and unknown bundle types.
addPlatform(
  platforms,
  "windows-x86_64",
  process.env.WINDOWS_INSTALLER,
  process.env.WINDOWS_SIG,
);
// Prefixed key: tauri-plugin-updater ≥2.10 resolves NSIS installs here first.
addPlatform(
  platforms,
  "windows-x86_64-nsis",
  process.env.WINDOWS_INSTALLER,
  process.env.WINDOWS_SIG,
);
addPlatform(
  platforms,
  "windows-x86_64-msi",
  process.env.WINDOWS_MSI,
  process.env.WINDOWS_MSI_SIG,
);

if (Object.keys(platforms).length === 0) {
  console.error("No updater platforms were configured");
  process.exit(1);
}

const latest = {
  version,
  notes: process.env.RELEASE_NOTES ?? "",
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync("latest.json", `${JSON.stringify(latest, null, 2)}\n`);
console.log("Wrote latest.json:", JSON.stringify(latest, null, 2));
