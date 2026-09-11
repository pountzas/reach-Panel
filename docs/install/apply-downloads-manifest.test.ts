import { describe, expect, it } from "vitest";

import { applyDownloadsManifest } from "./apply-downloads-manifest.mjs";

const BLOB_HOST = "2zhnilo5gijgvtoh.public.blob.vercel-storage.com";

function blobUrl(path: string) {
  return `https://${BLOB_HOST}/${path}`;
}

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

  it("keeps Android fallbacks when android is missing from the manifest", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: blobUrl("setup.exe"),
        msiUrl: blobUrl("app.msi"),
      },
    });

    expect(ui.setupCta.href).toBe(blobUrl("setup.exe"));
    expect(ui.msiCta.href).toBe(blobUrl("app.msi"));
    expect(ui.windowsVersion.textContent).toBe("0.13.0");
    expect(ui.apkCta.href).toBe("fallback-apk");
    expect(ui.apkCta.hidden).toBe(false);
    expect(ui.androidSection.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent).toMatch(/android/i);
  });

  it("keeps Windows fallbacks when windows is missing from the manifest", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      android: {
        version: "0.3.0",
        apkUrl: blobUrl("app.apk"),
      },
    });

    expect(ui.apkCta.href).toBe(blobUrl("app.apk"));
    expect(ui.androidVersion.textContent).toBe("0.3.0");
    expect(ui.setupCta.href).toBe("fallback-setup");
    expect(ui.msiCta.href).toBe("fallback-msi");
    expect(ui.setupCta.hidden).toBe(false);
    expect(ui.msiCta.hidden).toBe(false);
    expect(ui.windowsSection.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent).toMatch(/windows/i);
  });

  it("applies both platforms and clears the status note", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: blobUrl("setup.exe"),
        msiUrl: blobUrl("app.msi"),
      },
      android: {
        version: "0.3.0",
        apkUrl: blobUrl("app.apk"),
      },
      updatedAt: "2026-09-08T00:00:00.000Z",
    });

    expect(ui.setupCta.href).toBe(blobUrl("setup.exe"));
    expect(ui.msiCta.href).toBe(blobUrl("app.msi"));
    expect(ui.apkCta.href).toBe(blobUrl("app.apk"));
    expect(ui.windowsVersion.textContent).toBe("0.13.0");
    expect(ui.androidVersion.textContent).toBe("0.3.0");
    expect(ui.setupCta.hidden).toBe(false);
    expect(ui.apkCta.hidden).toBe(false);
    expect(ui.windowsSection.hidden).toBe(false);
    expect(ui.androidSection.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(true);
  });

  it("rejects javascript: URLs and keeps fallback hrefs", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: "javascript:alert(1)",
        msiUrl: blobUrl("app.msi"),
      },
      android: {
        version: "0.3.0",
        apkUrl: blobUrl("app.apk"),
      },
    });

    expect(ui.setupCta.href).toBe("fallback-setup");
    expect(ui.msiCta.href).toBe("fallback-msi");
    expect(ui.apkCta.href).toBe(blobUrl("app.apk"));
    expect(ui.setupCta.hidden).toBe(false);
    expect(ui.msiCta.hidden).toBe(false);
    expect(ui.apkCta.hidden).toBe(false);
    expect(ui.windowsSection.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent).toMatch(/windows/i);
  });

  it("rejects http:// blob host URLs", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: `http://${BLOB_HOST}/setup.exe`,
        msiUrl: `http://${BLOB_HOST}/app.msi`,
      },
      android: {
        version: "0.3.0",
        apkUrl: blobUrl("app.apk"),
      },
    });

    expect(ui.setupCta.href).toBe("fallback-setup");
    expect(ui.msiCta.href).toBe("fallback-msi");
    expect(ui.apkCta.href).toBe(blobUrl("app.apk"));
    expect(ui.setupCta.hidden).toBe(false);
    expect(ui.msiCta.hidden).toBe(false);
    expect(ui.apkCta.hidden).toBe(false);
    expect(ui.windowsSection.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent).toMatch(/windows/i);
  });

  it("rejects https URLs on other hosts", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: "https://evil.example.com/setup.exe",
        msiUrl: "https://evil.example.com/app.msi",
      },
      android: {
        version: "0.3.0",
        apkUrl: blobUrl("app.apk"),
      },
    });

    expect(ui.setupCta.href).toBe("fallback-setup");
    expect(ui.msiCta.href).toBe("fallback-msi");
    expect(ui.apkCta.href).toBe(blobUrl("app.apk"));
    expect(ui.setupCta.hidden).toBe(false);
    expect(ui.msiCta.hidden).toBe(false);
    expect(ui.apkCta.hidden).toBe(false);
    expect(ui.windowsSection.hidden).toBe(false);
    expect(ui.statusNote.hidden).toBe(false);
    expect(ui.statusNote.textContent).toMatch(/windows/i);
  });

  it("applies valid blob https URLs", () => {
    const ui = makeUi();
    applyDownloadsManifest(ui, {
      windows: {
        version: "0.13.0",
        exeUrl: blobUrl("ReachPanel_0.13.0_x64-setup.exe"),
        msiUrl: blobUrl("ReachPanel_0.13.0_x64_en-US.msi"),
      },
      android: {
        version: "0.3.0",
        apkUrl: blobUrl("ReachPanel-Companion.apk"),
      },
    });

    expect(ui.setupCta.href).toBe(blobUrl("ReachPanel_0.13.0_x64-setup.exe"));
    expect(ui.msiCta.href).toBe(blobUrl("ReachPanel_0.13.0_x64_en-US.msi"));
    expect(ui.apkCta.href).toBe(blobUrl("ReachPanel-Companion.apk"));
    expect(ui.statusNote.hidden).toBe(true);
  });
});
