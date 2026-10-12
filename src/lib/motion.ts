export const MOTION = {
  fast: 120,
  base: 200,
  slow: 300,
  /** Focus keyboard slide show/hide — keep in sync with --rp-dur-focus-keyboard. */
  focusKeyboard: 250,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Wait until the browser has painted at least one frame after the current
 * React commit. Needed before native window resize so the last FAB/keyboard
 * pixels are not stretched across the new bounds for a flash frame.
 */
export function afterNextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
