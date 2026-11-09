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
      .filter((step) =>
        /upload-apk-to-blob|merge-downloads-latest|BLOB_READ_WRITE_TOKEN|Deploy install site/i.test(
          step,
        ),
      );

    expect(blobRelated.length).toBeGreaterThan(0);
    for (const step of blobRelated) {
      if (/cleanup-old-apk-blobs/i.test(step)) {
        continue;
      }
      expect(step).not.toMatch(/continue-on-error:\s*true/);
    }
  });

  it("uses Node 22 so pinned eas-cli can install", () => {
    expect(yaml).toMatch(/node-version:\s*22\b/);
  });

  it("pins third-party actions and CLIs (no floating tags or @latest)", () => {
    const thirdPartyUses = [
      ...yaml.matchAll(/^\s*-?\s*uses:\s*(?!actions\/)([^\s#]+)/gm),
    ].map((m) => m[1]);

    expect(thirdPartyUses.length).toBeGreaterThan(0);
    for (const uses of thirdPartyUses) {
      expect(uses).toMatch(/@[0-9a-f]{40}$/);
      expect(uses).not.toMatch(/@(v\d+|stable|latest)$/);
    }
    expect(yaml).toMatch(/eas-version:\s*["']?\d+\.\d+\.\d+/);
    expect(yaml).not.toMatch(/eas-version:\s*["']?latest["']?/);
    expect(yaml).toMatch(/npx vercel@\d+\.\d+\.\d+/);
    expect(yaml).not.toMatch(/npx vercel@latest/);
  });

  it("serializes downloads/latest.json writes with Windows via concurrency group", () => {
    expect(yaml).toMatch(/group:\s*downloads-latest-blob/);
    // Workflow-level + job-level groups both queue instead of dropping pending runs.
    const queueMaxMatches = yaml.match(/queue:\s*max/g) ?? [];
    expect(queueMaxMatches.length).toBeGreaterThanOrEqual(2);
    expect(yaml).toMatch(/cancel-in-progress:\s*false/);
  });

  it("deploys install site without sed inject of INSTALL_APK placeholder", () => {
    expect(yaml).not.toContain("__INSTALL_APK_PUBLIC_URL__");
    expect(yaml).not.toMatch(/\bsed\s+-i\b/);
  });

  it("uploads only the stable APK to Blob, not a versioned pathname", () => {
    expect(yaml).toMatch(
      /upload-apk-to-blob\.mjs\s+ReachPanel-Companion\.apk\s+ReachPanel-Companion\.apk/,
    );
    expect(yaml).not.toMatch(
      /upload-apk-to-blob\.mjs\s+"ReachPanel-Companion-\$\{\{ steps\.bump\.outputs\.new_version \}\}\.apk"/,
    );
  });

  it("attaches versioned and stable APKs to the GitHub pre-release", () => {
    const releaseStart = yaml.indexOf("Create GitHub pre-release");
    expect(releaseStart).toBeGreaterThan(-1);
    const nextStep = yaml.indexOf("\n      - name:", releaseStart);
    const releaseStep = yaml.slice(
      releaseStart,
      nextStep === -1 ? undefined : nextStep,
    );
    expect(releaseStep).toContain(
      "ReachPanel-Companion-${{ steps.bump.outputs.new_version }}.apk",
    );
    expect(releaseStep).toContain("ReachPanel-Companion.apk");
  });

  it("cleans leftover versioned APK blobs after the GitHub pre-release", () => {
    const releaseIdx = yaml.indexOf("Create GitHub pre-release");
    const cleanupIdx = yaml.indexOf("cleanup-old-apk-blobs.mjs");
    expect(releaseIdx).toBeGreaterThan(-1);
    expect(cleanupIdx).toBeGreaterThan(releaseIdx);
    expect(yaml).toContain('PREVIOUS_VERSION: ${{ steps.bump.outputs.previous_version }}');
    expect(yaml).toContain('--previous-version "$PREVIOUS_VERSION"');
    const cleanupRun = yaml.slice(cleanupIdx, cleanupIdx + 250);
    expect(cleanupRun).toContain("cleanup-old-apk-blobs.mjs");
    expect(cleanupRun).toMatch(/--sweep\b/);
  });

  it("gates blob cleanup on release, blob, merge, deploy, and github release success", () => {
    expect(yaml).toMatch(/id:\s*deploy_install/);
    expect(yaml).toMatch(/id:\s*github_release/);
    const cleanupStart = yaml.indexOf("Remove old versioned APKs from Vercel Blob");
    expect(cleanupStart).toBeGreaterThan(-1);
    const cleanupStep = yaml.slice(cleanupStart, cleanupStart + 800);
    expect(cleanupStep).toContain("steps.bump.outputs.should_release == 'true'");
    expect(cleanupStep).toContain("steps.blob.outcome == 'success'");
    expect(cleanupStep).toContain("steps.merge_downloads.outcome == 'success'");
    expect(cleanupStep).toContain("steps.deploy_install.outcome == 'success'");
    expect(cleanupStep).toContain("steps.github_release.outcome == 'success'");
    expect(cleanupStep).toMatch(/continue-on-error:\s*true/);
  });

  it("does not run blob cleanup from other release workflows", () => {
    const workflowsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      ".github",
      "workflows",
    );
    for (const name of ["build.yml", "deploy-install-site.yml", "release.yml"]) {
      const other = readFileSync(join(workflowsDir, name), "utf8");
      expect(other).not.toContain("cleanup-old-apk-blobs");
    }
  });
});
