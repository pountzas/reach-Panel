// @vitest-environment jsdom
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  applyFlipInvert,
  clearFlipStyles,
  flipInvertTransform,
  FLIP_TRANSFORM_TRANSITION,
  playFlipToIdentity,
} from "./flipLayout";
import { useFlipLayoutTransition } from "../hooks/useFlipLayoutTransition";

vi.mock("./motion", () => ({
  prefersReducedMotion: () => false,
}));

describe("useFlipLayoutTransition trigger gating (issue #274)", () => {
  it("does not animate when only layout changes; animates when trigger flips", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { rerender } = renderHook(
      ({
        layout,
        trigger,
      }: {
        layout: { top: number; height: number };
        trigger: boolean;
      }) => {
        const ref = useRef(el);
        useFlipLayoutTransition(ref, layout, trigger);
      },
      {
        initialProps: {
          layout: { top: 100, height: 200 },
          trigger: false,
        },
      },
    );

    act(() => {
      rerender({ layout: { top: 100, height: 80 }, trigger: false });
    });
    expect(el.style.transform).toBe("");

    act(() => {
      rerender({ layout: { top: 220, height: 60 }, trigger: true });
    });
    expect(el.style.transform.startsWith("translateY(")).toBe(true);

    el.remove();
  });
});

describe("flipInvertTransform", () => {
  it("returns translateY so the new top looks like the old one", () => {
    expect(
      flipInvertTransform({ top: 100, height: 200 }, { top: 40, height: 80 }),
    ).toEqual({ translateY: 60 });
  });

  it("returns null when top did not change (height-only)", () => {
    expect(
      flipInvertTransform({ top: 10, height: 50 }, { top: 10, height: 80 }),
    ).toBeNull();
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

  it("animates top change even when previous height was zero", () => {
    expect(
      flipInvertTransform({ top: 20, height: 0 }, { top: 0, height: 40 }),
    ).toEqual({ translateY: 20 });
  });
});

describe("applyFlipInvert / playFlipToIdentity", () => {
  it("promotes the layer only while the transform transition runs", () => {
    const el = document.createElement("div");
    applyFlipInvert(el, { translateY: 40 });
    expect(el.style.willChange).toBe("transform");
    expect(el.style.transform).toBe("translateY(40px)");
    expect(el.style.transition).toBe("none");

    const stop = playFlipToIdentity(el);
    expect(el.style.transition).toBe(FLIP_TRANSFORM_TRANSITION);
    expect(el.style.transform).toBe("translateY(0)");
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
    applyFlipInvert(el, { translateY: 1 });
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
    applyFlipInvert(el, { translateY: 10 });
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
