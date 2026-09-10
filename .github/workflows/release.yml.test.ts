import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const yaml = readFileSync(join(__dirname, "release.yml"), "utf8");

describe("release.yml Windows Blob downloads upload", () => {
  it("uploads installers via upload-to-blob with stable pathnames", () => {
    expect(yaml).toContain("scripts/upload-to-blob.mjs");
    expect(yaml).toContain("ReachPanel-Setup.exe");
    expect(yaml).toContain("ReachPanel.msi");
  });

  it("merge-patches windows in downloads/latest.json", () => {
    expect(yaml).toContain("scripts/merge-downloads-latest.mjs");
    expect(yaml).toMatch(/--platform\s+windows|PLATFORM=windows/);
  });

  it("keeps the Tauri updater metadata pipeline", () => {
    expect(yaml).toContain("publish-updater-metadata");
    expect(yaml).toContain("generate-latest-json.mjs");
  });

  it("does not mark the blob upload step as continue-on-error", () => {
    const idx = yaml.indexOf("scripts/upload-to-blob.mjs");
    expect(idx).toBeGreaterThanOrEqual(0);
    const blobSection = yaml.slice(Math.max(0, idx - 400), idx + 800);
    expect(blobSection).not.toMatch(/continue-on-error\s*:\s*true/);
  });
});
