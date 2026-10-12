// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION, prefersReducedMotion } from "./motion";

const indexCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../index.css"),
  "utf8",
);

describe("motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports durations matching CSS tokens", () => {
    expect(MOTION.fast).toBe(120);
    expect(MOTION.base).toBe(200);
    expect(MOTION.slow).toBe(300);
  });

  it("prefersReducedMotion reads matchMedia", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    expect(prefersReducedMotion()).toBe(true);
  });

  it("prefersReducedMotion is false when matchMedia says no", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    expect(prefersReducedMotion()).toBe(false);
  });

  it("keeps a static amber outline on active music chips (not transitioned)", () => {
    expect(indexCss).toMatch(
      /\.music-note-chip-active\s*\{[^}]*box-shadow:\s*0 0 0 2px rgb\(245 158 11 \/ 0\.9\)/,
    );
    expect(indexCss).not.toMatch(/box-shadow\s+\d+ms/);
  });
});
