import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflowPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".github",
  "workflows",
  "release-android.yml",
);

describe("release-android.yml downloads landing contract", () => {
  const yaml = readFileSync(workflowPath, "utf8").replace(/\r\n/g, "\n");

  it("uploads APK via companion script and merges android downloads manifest", () => {
    expect(yaml).toContain("companion/scripts/upload-apk-to-blob.mjs");
    expect(yaml).toContain("scripts/merge-downloads-latest.mjs");
    expect(yaml).toMatch(/--platform\s+android|PLATFORM=android/);
  });

  it("fails loudly on blob upload or merge (no continue-on-error)", () => {
    const blobRelated = yaml
      .split(/\n(?= {2}- )/)
      .filter(
        (step) =>
          /upload-apk-to-blob|merge-downloads-latest|BLOB_READ_WRITE_TOKEN|Deploy install site/i.test(
            step,
          ),
      );

    expect(blobRelated.length).toBeGreaterThan(0);
    for (const step of blobRelated) {
      expect(step).not.toMatch(/continue-on-error:\s*true/);
    }
  });

  it("uses Node 22 so eas-cli@latest can install", () => {
    expect(yaml).toMatch(/node-version:\s*22\b/);
  });

  it("deploys install site without sed inject of INSTALL_APK placeholder", () => {
    expect(yaml).not.toContain("__INSTALL_APK_PUBLIC_URL__");
    expect(yaml).not.toMatch(/\bsed\s+-i\b/);
  });
});
