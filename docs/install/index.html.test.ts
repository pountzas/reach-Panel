import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "index.html"), "utf8");

const DOWNLOADS_LATEST_URL =
  "https://2zhnilo5gijgvtoh.public.blob.vercel-storage.com/downloads/latest.json";
const FALLBACK_APK =
  "https://2zhnilo5gijgvtoh.public.blob.vercel-storage.com/ReachPanel-Companion.apk";
const FALLBACK_SETUP =
  "https://github.com/pountzas/reach-Panel/releases/download/v0.12.0/ReachPanel_0.12.0_x64-setup.exe";
const FALLBACK_MSI =
  "https://github.com/pountzas/reach-Panel/releases/download/v0.12.0/ReachPanel_0.12.0_x64_en-US.msi";

describe("docs/install/index.html downloads page", () => {
  it("titles the page ReachPanel Downloads", () => {
    expect(html).toMatch(/<title>\s*ReachPanel Downloads\s*<\/title>/i);
    expect(html).toMatch(/<h1[^>]*>\s*ReachPanel Downloads\s*<\/h1>/i);
  });

  it("ships three CTAs with required labels and fallback hrefs", () => {
    expect(html).toContain("Download Setup");
    expect(html).toContain("Download MSI");
    expect(html).toContain("Download APK");
    expect(html).toContain(FALLBACK_SETUP);
    expect(html).toContain(FALLBACK_MSI);
    expect(html).toContain(FALLBACK_APK);
  });

  it("fetches the Blob downloads/latest.json URL", () => {
    expect(html).toContain(DOWNLOADS_LATEST_URL);
  });

  it("drops the APK placeholder and Play Store retarget comment", () => {
    expect(html).not.toContain("__INSTALL_APK_PUBLIC_URL__");
    expect(html).not.toMatch(/Play Store/i);
  });

  it("links to the GitHub repo and Releases", () => {
    expect(html).toContain(
      "https://github.com/pountzas/accessibility-keyboard",
    );
    expect(html).toContain(
      "https://github.com/pountzas/accessibility-keyboard/releases",
    );
  });

  it("shows the companion QR next to the APK button", () => {
    expect(html).toContain('id="apk-page-qr"');
    expect(html).toContain('src="companion-apk-qr.png"');
    expect(html).toContain("QR code for this downloads page");
    expect(existsSync(join(__dirname, "companion-apk-qr.png"))).toBe(true);
  });

  it("loads GitHub download counts next to each CTA", () => {
    expect(html).toContain("./github-download-counts.mjs");
    expect(html).toContain("fetchAllGithubReleases");
    expect(html).toContain('id="download-setup-count"');
    expect(html).toContain('id="download-msi-count"');
    expect(html).toContain('id="download-apk-count"');
    expect(html).toMatch(/id="download-setup-count"[^>]*hidden/);
    expect(html).toMatch(/id="download-msi-count"[^>]*hidden/);
    expect(html).toMatch(/id="download-apk-count"[^>]*hidden/);
  });
});
