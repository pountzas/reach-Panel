import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const yaml = readFileSync(join(__dirname, "build.yml"), "utf8");

describe("build.yml PR checks", () => {
  it("runs typecheck, vitest, and test:blob on Windows for PRs to main and dev", () => {
    expect(yaml).toMatch(/branches:\s*\[[^\]]*\bmain\b[^\]]*\bdev\b/);
    expect(yaml).toMatch(/check:/);
    expect(yaml).toContain("runs-on: windows-latest");
    expect(yaml).toContain("npm run typecheck");
    expect(yaml).toContain("npm test");
    expect(yaml).toContain("npm run test:blob");
    expect(yaml).toContain("cargo check --locked --all-targets");
    expect(yaml).toContain("cargo test --locked");
  });

  it("uses Node 22 in every job", () => {
    const versions = [...yaml.matchAll(/^\s+node-version:\s*(\S+)\s*$/gm)].map(
      (match) => match[1],
    );
    expect(versions).toEqual(["22", "22"]);
  });
});
