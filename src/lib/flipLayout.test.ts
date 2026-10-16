// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyFlipInvert,
  clearFlipStyles,
  flipInvertTransform,
  FLIP_TRANSFORM_TRANSITION,
  playFlipToIdentity,
} from "./flipLayout";

const dockedSectionSrc = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../components/layout/DockedSection.tsx",
  ),
  "utf8",
);

describe("DockedSection compositing (issue #274)", () => {
  it("does not animate layout props top/height", () => {
    expect(dockedSectionSrc).not.toMatch(/transition-\[top,\s*height\]/);
    expect(dockedSectionSrc).not.toMatch(/transition:\s*[^;]*(top|height)/);
  });

  it("uses transform-only FLIP for minimize/restore geometry changes", () => {
    expect(dockedSectionSrc).toContain("useFlipLayoutTransition");
  });
});

describe("flipInvertTransform", () => {
  it("returns translateY and scaleY so the new box looks like the old one", () => {
    expect(
      flipInvertTransform({ top: 100, height: 200 }, { top: 40, height: 80 }),
    ).toEqual({ translateY: 60, scaleY: 2.5 });
  });

  it("returns null when layout did not change", () => {
    expect(
      flipInvertTransform({ top: 10, height: 50 }, { top: 10, height: 50 }),
    ).toBeNull();
  });

  it("returns null when the destination height is not positive", () => {
    expect(
      flipInvertTransform({ top: 0, height: 40 }, { top: 0, height: 0 }),
    ).toBeNull();
  });

  it("uses scaleY 1 when the previous height was zero", () => {
    expect(
      flipInvertTransform({ top: 20, height: 0 }, { top: 0, height: 40 }),
    ).toEqual({ translateY: 20, scaleY: 1 });
  });
});

describe("applyFlipInvert / playFlipToIdentity", () => {
  it("promotes the layer only while the transform transition runs", () => {
    const el = document.createElement("div");
    applyFlipInvert(el, { translateY: 40, scaleY: 2 });
    expect(el.style.willChange).toBe("transform");
    expect(el.style.transform).toBe("translateY(40px) scaleY(2)");
    expect(el.style.transition).toBe("none");

    const stop = playFlipToIdentity(el);
    expect(el.style.transition).toBe(FLIP_TRANSFORM_TRANSITION);
    expect(el.style.transform).toBe("translateY(0) scaleY(1)");
    expect(el.style.willChange).toBe("transform");

    el.dispatchEvent(
      new TransitionEvent("transitionend", { propertyName: "opacity" }),
    );
    expect(el.style.willChange).toBe("transform");

    el.dispatchEvent(
      new TransitionEvent("transitionend", { propertyName: "transform" }),
    );
    expect(el.style.willChange).toBe("");
    expect(el.style.transform).toBe("");
    stop();
  });

  it("clearFlipStyles strips invert inline styles", () => {
    const el = document.createElement("div");
    applyFlipInvert(el, { translateY: 1, scaleY: 1.5 });
    clearFlipStyles(el);
    expect(el.style.willChange).toBe("");
    expect(el.style.transform).toBe("");
    expect(el.style.transition).toBe("");
    expect(el.style.transformOrigin).toBe("");
  });

  it("uses shared duration/ease token names in the transition string", () => {
    expect(FLIP_TRANSFORM_TRANSITION).toContain("--rp-dur-base");
    expect(FLIP_TRANSFORM_TRANSITION).toContain("--rp-ease-out");
  });

  it("ignores transitionend from a child target", () => {
    const el = document.createElement("div");
    const child = document.createElement("span");
    el.appendChild(child);
    applyFlipInvert(el, { translateY: 10, scaleY: 1 });
    playFlipToIdentity(el);
    child.dispatchEvent(
      new TransitionEvent("transitionend", {
        propertyName: "transform",
        bubbles: true,
      }),
    );
    expect(el.style.willChange).toBe("transform");
    el.dispatchEvent(
      new TransitionEvent("transitionend", { propertyName: "transform" }),
    );
    expect(el.style.willChange).toBe("");
  });
});
