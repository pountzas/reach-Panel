import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  applyFlipInvert,
  clearFlipStyles,
  flipInvertTransform,
  playFlipToIdentity,
  type FlipRect,
} from "../lib/flipLayout";
import { prefersReducedMotion } from "../lib/motion";

/**
 * After layout snaps to `layout`, play a transform-only FLIP from the previous
 * rect. No-ops on first paint and when prefers-reduced-motion is on.
 */
export function useFlipLayoutTransition(
  ref: RefObject<HTMLElement | null>,
  layout: FlipRect,
): void {
  const prevRef = useRef<FlipRect | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const prev = prevRef.current;
    prevRef.current = layout;
    if (!el || !prev) return;
    if (prefersReducedMotion()) return;

    const invert = flipInvertTransform(prev, layout);
    if (!invert) return;

    applyFlipInvert(el, invert);
    // Force style flush so the invert paints before the identity transition.
    void el.offsetHeight;
    const stop = playFlipToIdentity(el);
    return () => {
      stop();
      clearFlipStyles(el);
    };
  }, [ref, layout.top, layout.height]);
}
