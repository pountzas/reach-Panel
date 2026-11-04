import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SCAN_DIRS = ["src", "src-tauri"];
const SKIP_DIR_NAMES = new Set(["node_modules", "target", "dist", ".git"]);
const SELF = `${sep}noServiceRoleKey.test.ts`;

function walk(dir: string, files: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const path = join(dir, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(path, files);
      continue;
    }
    if (!stat.isFile()) continue;
    if (path.endsWith(SELF)) continue;
    files.push(path);
  }
}

describe("diagnostics secrets", () => {
  it("does not embed the service role key name under src or src-tauri", () => {
    const needles = ["service" + "_role", "SUPABASE_SERVICE_ROLE_" + "KEY"];
    const files: string[] = [];
    for (const dir of SCAN_DIRS) {
      walk(join(ROOT, dir), files);
    }
    const hits: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const needle of needles) {
        if (text.includes(needle)) {
          hits.push(`${relative(ROOT, file)} contains ${needle}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
