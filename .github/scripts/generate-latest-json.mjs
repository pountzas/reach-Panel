import fs from "node:fs";
import path from "node:path";

const tag = process.env.RELEASE_TAG;
if (!tag) {
  console.error("RELEASE_TAG is required");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
const repo = process.env.GITHUB_REPOSITORY ?? "pountzas/accessibility-keyboard";
const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;

function readSignature(sigPath) {
  return fs.readFileSync(sigPath, "utf8").trim();
}

function addPlatform(platforms, platformKey, installerPath, sigPath) {
  if (!installerPath || !sigPath) {
    return;
  }
  platforms[platformKey] = {
    url: `${baseUrl}/${path.basename(installerPath)}`,
    signature: readSignature(sigPath),
  };
}

const platforms = {};

addPlatform(
  platforms,
  "windows-x86_64",
  process.env.WINDOWS_INSTALLER,
  process.env.WINDOWS_SIG,
);
addPlatform(
  platforms,
  "darwin-aarch64",
  process.env.MACOS_INSTALLER,
  process.env.MACOS_SIG,
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
