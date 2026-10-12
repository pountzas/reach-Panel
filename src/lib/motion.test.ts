// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION, prefersReducedMotion } from "./motion";

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
});
