import { describe, expect, it } from "vitest";

import {
  applyCountLabel,
  applyDownloadCounts,
  classifyReleaseAsset,
  fetchAllGithubReleases,
  formatDownloadCount,
  GITHUB_RELEASES_API_URL,
  parseNextLink,
  readCountUi,
  sumGithubDownloadCounts,
} from "./github-download-counts.mjs";

describe("classifyReleaseAsset", () => {
  it("classifies setup exe and skips signatures", () => {
    expect(classifyReleaseAsset("ReachPanel_0.12.0_x64-setup.exe")).toBe(
      "setup",
    );
    expect(
      classifyReleaseAsset("ReachPanel_0.12.0_x64-setup.exe.sig"),
    ).toBeNull();
  });

  it("classifies msi and apk", () => {
    expect(classifyReleaseAsset("ReachPanel_0.12.0_x64_en-US.msi")).toBe("msi");
    expect(classifyReleaseAsset("ReachPanel-Companion-0.3.0.apk")).toBe("apk");
  });

  it("ignores updater json, dmg, and wordpacks", () => {
    expect(classifyReleaseAsset("latest.json")).toBeNull();
    expect(classifyReleaseAsset("ReachPanel_0.6.2_aarch64.dmg")).toBeNull();
    expect(classifyReleaseAsset("el.json")).toBeNull();
  });
});

describe("sumGithubDownloadCounts", () => {
  it("sums setup, msi, and apk across releases", () => {
    const counts = sumGithubDownloadCounts([
      {
        assets: [
          { name: "ReachPanel_0.12.0_x64-setup.exe", download_count: 2 },
          { name: "ReachPanel_0.12.0_x64-setup.exe.sig", download_count: 9 },
          { name: "ReachPanel_0.12.0_x64_en-US.msi", download_count: 1 },
          { name: "latest.json", download_count: 4 },
        ],
      },
      {
        assets: [
          { name: "ReachPanel_0.11.2_x64-setup.exe", download_count: 2 },
          { name: "ReachPanel_0.11.2_x64_en-US.msi", download_count: 0 },
        ],
      },
      {
        assets: [
          { name: "ReachPanel-Companion-0.3.0.apk", download_count: 5 },
          { name: "ReachPanel-Companion.apk", download_count: 5 },
        ],
      },
    ]);

    expect(counts).toEqual({ setup: 4, msi: 1, apk: 5 });
  });

  it("counts a stable-only APK when the versioned file is absent", () => {
    const counts = sumGithubDownloadCounts([
      {
        assets: [{ name: "ReachPanel-Companion.apk", download_count: 3 }],
      },
    ]);
    expect(counts.apk).toBe(3);
  });
});

describe("formatDownloadCount", () => {
  it("returns null for zero and non-numbers", () => {
    expect(formatDownloadCount(0)).toBeNull();
    expect(formatDownloadCount(-1)).toBeNull();
    expect(formatDownloadCount(undefined)).toBeNull();
  });

  it("uses singular and plural labels", () => {
    expect(formatDownloadCount(1)).toBe("1 download");
    expect(formatDownloadCount(12)).toBe("12 downloads");
  });
});

describe("parseNextLink", () => {
  it("reads rel=next from a GitHub Link header", () => {
    const header =
      '<https://api.github.com/repos/pountzas/reach-Panel/releases?page=2>; rel="next", <https://api.github.com/repos/pountzas/reach-Panel/releases?page=3>; rel="last"';
    expect(parseNextLink(header)).toBe(
      "https://api.github.com/repos/pountzas/reach-Panel/releases?page=2",
    );
  });

  it("returns null when there is no next page", () => {
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('<https://example.com>; rel="last"')).toBeNull();
  });
});

describe("applyCountLabel", () => {
  it("hides the line for zero and shows a label otherwise", () => {
    const el = { textContent: "stale", hidden: false };
    applyCountLabel(el, 0);
    expect(el).toEqual({ textContent: "", hidden: true });

    applyCountLabel(el, 1);
    expect(el).toEqual({ textContent: "1 download", hidden: false });
  });
});

describe("applyDownloadCounts", () => {
  function stubUi() {
    return {
      setup: { textContent: "", hidden: true },
      msi: { textContent: "", hidden: true },
      apk: { textContent: "", hidden: true },
    };
  }

  it("fills each CTA independently and hides zeros", () => {
    const ui = stubUi();
    applyDownloadCounts(ui, { setup: 4, msi: 0, apk: 12 });
    expect(ui.setup).toEqual({ textContent: "4 downloads", hidden: false });
    expect(ui.msi).toEqual({ textContent: "", hidden: true });
    expect(ui.apk).toEqual({ textContent: "12 downloads", hidden: false });
  });

  it("hides every line when counts are missing", () => {
    const ui = stubUi();
    ui.setup.textContent = "stale";
    ui.setup.hidden = false;
    applyDownloadCounts(ui, null);
    expect(ui.setup).toEqual({ textContent: "", hidden: true });
    expect(ui.msi.hidden).toBe(true);
    expect(ui.apk.hidden).toBe(true);
  });
});

describe("readCountUi", () => {
  it("returns null unless all three count nodes exist", () => {
    const root = {
      querySelector: (sel: string) =>
        sel === "#download-setup-count" ? { id: sel } : null,
    };
    expect(readCountUi(root as unknown as ParentNode)).toBeNull();
  });
});

describe("fetchAllGithubReleases", () => {
  it("follows rel=next and concatenates pages", async () => {
    const page1 = [{ assets: [{ name: "a.exe", download_count: 1 }] }];
    const page2 = [{ assets: [{ name: "b.exe", download_count: 2 }] }];
    const fetchImpl = async (url: string) => {
      if (url.includes("page=2")) {
        return {
          ok: true,
          json: async () => page2,
          headers: { get: () => null },
        };
      }
      return {
        ok: true,
        json: async () => page1,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "link"
              ? '<https://api.github.com/repos/pountzas/reach-Panel/releases?page=2>; rel="next"'
              : null,
        },
      };
    };

    const releases = await fetchAllGithubReleases(
      fetchImpl as unknown as typeof fetch,
      GITHUB_RELEASES_API_URL,
    );
    expect(releases).toEqual([...page1, ...page2]);
  });

  it("returns null on a non-OK response", async () => {
    const fetchImpl = async () => ({
      ok: false,
      json: async () => [],
      headers: { get: () => null },
    });
    await expect(
      fetchAllGithubReleases(fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchImpl = async () => {
      throw new Error("network");
    };
    await expect(
      fetchAllGithubReleases(fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull();
  });
});
