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
 * rect when `trigger` changes (e.g. teaching keyboard minimized). No-ops on
 * first paint, when the trigger is unchanged, and when prefers-reduced-motion
 * is on.
 */
export function useFlipLayoutTransition(
  ref: RefObject<HTMLElement | null>,
  layout: FlipRect,
  /** Animate only when this value changes (e.g. teaching keyboard minimized). */
  trigger: unknown,
): void {
  const prevRef = useRef<FlipRect | null>(null);
  const prevTriggerRef = useRef(trigger);

  useLayoutEffect(() => {
    const el = ref.current;
    const prev = prevRef.current;
    const triggerChanged = !Object.is(prevTriggerRef.current, trigger);
    prevRef.current = layout;
    prevTriggerRef.current = trigger;
    if (!el || !prev || !triggerChanged) return;
    if (prefersReducedMotion()) return;

    const invert = flipInvertTransform(prev, layout);
    if (!invert) return;

    applyFlipInvert(el, invert);
    // Force style flush so the invert paints before the identity transition.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- layout reflow
    el.offsetHeight;
    const stop = playFlipToIdentity(el);
    return () => {
      stop();
      clearFlipStyles(el);
    };
  }, [ref, layout.top, layout.height, trigger]);
}
