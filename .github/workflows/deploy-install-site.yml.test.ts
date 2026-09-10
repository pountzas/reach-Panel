import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const yaml = readFileSync(join(__dirname, "deploy-install-site.yml"), "utf8");

describe("deploy-install-site.yml dual-platform downloads deploy", () => {
  it("deploys docs/install to Vercel production", () => {
    expect(yaml).toContain(
      'npx vercel@latest deploy docs/install --prod --yes --token="$VERCEL_TOKEN"',
    );
  });

  it("has no sed inject of INSTALL_APK_PUBLIC_URL", () => {
    expect(yaml).not.toContain("INSTALL_APK_PUBLIC_URL");
    expect(yaml).not.toContain("__INSTALL_APK_PUBLIC_URL__");
    expect(yaml).not.toMatch(/\bsed\b/);
  });

  it("keeps workflow_dispatch, path filters, and concurrency", () => {
    expect(yaml).toContain("workflow_dispatch");
    expect(yaml).toContain("docs/install/**");
    expect(yaml).toContain(".github/workflows/deploy-install-site.yml");
    expect(yaml).toMatch(/group:\s*deploy-install-site/);
  });
});
