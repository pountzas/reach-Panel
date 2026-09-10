import { describe, expect, it } from "vitest";

import { applyDownloadsManifest } from "./apply-downloads-manifest.mjs";

function makeUi() {
  return {
    setupCta: { href: "fallback-setup", hidden: false },
    msiCta: { href: "fallback-msi", hidden: false },
    apkCta: { href: "fallback-apk", hidden: false },
    windowsVersion: { textContent: "0.12.0" },
    androidVersion: { textContent: "" },
    windowsSection: { hidden: false },
    androidSection: { hidden: false },
    statusNote: { textContent: "", hidden: true },
  };
}

describe("applyDownloadsManifest", () => {
  it("keeps fallback hrefs and shows a note when manifest is null", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, null);

    expect(ui.setupCta.href).toBe("fallback-setup");
    expect(ui.msiCta.href).toBe("fallback-msi");
    expect(ui.apkCta.href).toBe("fallback-apk");
    expect(ui.setupCta.hidden).toBe(false);
    expect(ui.apkCta.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent.length).toBeGreaterThan(0);
  });

  it("hides Android CTAs when android is missing from the manifest", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: "https://example.com/setup.exe",
        msiUrl: "https://example.com/app.msi",
      },
    });

    expect(ui.setupCta.href).toBe("https://example.com/setup.exe");
    expect(ui.msiCta.href).toBe("https://example.com/app.msi");
    expect(ui.windowsVersion.textContent).toBe("0.13.0");
    expect(ui.apkCta.hidden).toBe(true);
    expect(ui.androidSection.hidden).toBe(true);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent).toMatch(/android/i);
  });

  it("hides Windows CTAs when windows is missing from the manifest", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      android: {
        version: "0.3.0",
        apkUrl: "https://example.com/app.apk",
      },
    });

    expect(ui.apkCta.href).toBe("https://example.com/app.apk");
    expect(ui.androidVersion.textContent).toBe("0.3.0");
    expect(ui.setupCta.hidden).toBe(true);
    expect(ui.msiCta.hidden).toBe(true);
    expect(ui.windowsSection.hidden).toBe(true);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent).toMatch(/windows/i);
  });

  it("applies both platforms and clears the status note", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: "https://example.com/setup.exe",
        msiUrl: "https://example.com/app.msi",
      },
      android: {
        version: "0.3.0",
        apkUrl: "https://example.com/app.apk",
      },
      updatedAt: "2026-09-08T00:00:00.000Z",
    });

    expect(ui.setupCta.href).toBe("https://example.com/setup.exe");
    expect(ui.msiCta.href).toBe("https://example.com/app.msi");
    expect(ui.apkCta.href).toBe("https://example.com/app.apk");
    expect(ui.windowsVersion.textContent).toBe("0.13.0");
    expect(ui.androidVersion.textContent).toBe("0.3.0");
    expect(ui.setupCta.hidden).toBe(false);
    expect(ui.apkCta.hidden).toBe(false);
    expect(ui.windowsSection.hidden).toBe(false);
    expect(ui.androidSection.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(true);
  });
});
