/**
 * FLIP invert for docked section layout changes: snap final top/height in
 * layout, then animate only transform (translateY + scaleY) to identity.
 */

export type FlipRect = {
  top: number;
  height: number;
};

export type FlipInvert = {
  translateY: number;
  scaleY: number;
};

/** CSS transition using shared motion tokens (see index.css :root). */
export const FLIP_TRANSFORM_TRANSITION =
  "transform var(--rp-dur-base) var(--rp-ease-out)" as const;

/**
 * Inverse transform that makes `to` look like `from` when applied after the
 * element has already been laid out at `to`. Returns null when there is nothing
 * to animate.
 */
export function flipInvertTransform(
  from: FlipRect,
  to: FlipRect,
): FlipInvert | null {
  if (!(to.height > 0)) return null;
  const translateY = from.top - to.top;
  const scaleY = from.height > 0 ? from.height / to.height : 1;
  if (translateY === 0 && Math.abs(scaleY - 1) < 0.0001) return null;
  return { translateY, scaleY };
}

export function applyFlipInvert(el: HTMLElement, invert: FlipInvert): void {
  el.style.transformOrigin = "top left";
  el.style.transition = "none";
  el.style.willChange = "transform";
  el.style.transform = `translateY(${invert.translateY}px) scaleY(${invert.scaleY})`;
}

export function clearFlipStyles(el: HTMLElement): void {
  el.style.willChange = "";
  el.style.transition = "";
  el.style.transform = "";
  el.style.transformOrigin = "";
}

/**
 * After invert is applied, enable the transform transition to identity.
 * Clears will-change and inline transform styles on transitionend.
 * Returns a cleanup that removes the listener (does not clear styles mid-flight
 * unless you call clearFlipStyles yourself).
 */
export function playFlipToIdentity(el: HTMLElement): () => void {
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== el) return;
    if (event.propertyName !== "transform") return;
    clearFlipStyles(el);
    el.removeEventListener("transitionend", onEnd);
  };
  el.addEventListener("transitionend", onEnd);
  el.style.transition = FLIP_TRANSFORM_TRANSITION;
  el.style.transform = "translateY(0) scaleY(1)";
  return () => {
    el.removeEventListener("transitionend", onEnd);
  };
}
