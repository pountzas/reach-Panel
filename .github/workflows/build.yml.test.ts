import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const yaml = readFileSync(join(__dirname, "build.yml"), "utf8");

describe("build.yml PR checks", () => {
  it("runs test:blob before release changes merge", () => {
    expect(yaml).toContain("npm run test:blob");
    expect(yaml).toMatch(/test-blob:/);
  });

  it("uses Node 22 in every job", () => {
    const versions = [...yaml.matchAll(/^\s+node-version:\s*(\S+)\s*$/gm)].map(
      (match) => match[1],
    );
    expect(versions).toEqual(["22", "22"]);
  });
});
