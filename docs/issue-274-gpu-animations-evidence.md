# Issue #274 — GPU-composited animations (evidence)

## Changed (layout → transform/opacity)

| Surface | Before | After |
| --- | --- | --- |
| Teaching / docked minimize (`DockedSection`) | CSS `transition-[top,height]` (layout thrash) | Snap `top`/`height`; FLIP via `translateY` + `scaleY` only (`useFlipLayoutTransition` / `flipLayout.ts`). Tokens: `--rp-dur-base` / `--rp-ease-out`. |
| Mode menu FAB (`ModeMenu`) | Already `opacity` + `translateX` | Same motion; `will-change: opacity, transform` only while transitioning. |
| Collapsed FAB stack appear | Already `opacity` + `scale` | Same; temporary `will-change` during stagger appear. |

## Unchanged (already transform/opacity)

- Focus keyboard sheet (`FocusModeShell`): `transition-transform` + `translate-y-*`, `--rp-dur/ease-focus-keyboard`.
- Mode view transitions (`index.css` `.rp-vt-fade-slide`): opacity + `translateX`; reduced-motion zeros durations.
- `storeShared` focus sync: native window resize + content anim orchestration only (no CSS layout props).

## will-change strategy

Promote only for the active transition; clear on `transitionend` (FLIP / ModeMenu) or settle timeout (FAB stagger). No permanent `will-change` on these surfaces.

## reduced-motion

FLIP skipped when `prefersReducedMotion()`; ModeMenu / FAB already skip transitions; CSS `@media (prefers-reduced-motion: reduce)` still sets duration tokens to `1ms`.

## Verification

- `npm run typecheck` — pass
- `npm test --` flipLayout, CollapsedFab, FocusModeShell, modeMenu, motion, teachingKeyboardMinimize — pass
