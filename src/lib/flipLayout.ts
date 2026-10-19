/**
 * FLIP invert for docked section layout changes: snap final top/height in
 * layout, then animate only translateY to identity (no scaleY — that stretches
 * header/content during minimize/restore).
 */

export type FlipRect = {
  top: number;
  height: number;
}

export type FlipInvert = {
  translateY: number;
}

/** CSS transition using shared motion tokens (see index.css :root). */
export const FLIP_TRANSFORM_TRANSITION =
  "transform var(--rp-dur-base) var(--rp-ease-out)" as const;

/**
 * Inverse transform that makes `to` look like the previous top when applied
 * after the element has already been laid out at `to`. Height-only changes
 * (same top) return null — no animation. Returns null when there is nothing
 * to animate.
 */
export function flipInvertTransform(
  from: FlipRect,
  to: FlipRect,
): FlipInvert | null {
  if (!(to.height > 0)) return null;
  const translateY = from.top - to.top;
  if (translateY === 0) return null;
  return { translateY };
}

export function applyFlipInvert(el: HTMLElement, invert: FlipInvert): void {
  el.style.transformOrigin = "top left";
  el.style.transition = "none";
  el.style.willChange = "transform";
  el.style.transform = `translateY(${invert.translateY}px)`;
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
  el.style.transform = "translateY(0)";
  return () => {
    el.removeEventListener("transitionend", onEnd);
  };
}
