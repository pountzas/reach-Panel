# GPU-composited UI motion — Design Spec

**Date:** 2026-10-11  
**Status:** Approved for implementation  
**Issue:** [#204](https://github.com/pountzas/reach-Panel/issues/204)  
**Approach:** B — compositor-first for Focus show/hide; time-based native window animation only where the window must still morph mid-flight

## 1. Goals

- Shared motion tokens and `prefers-reduced-motion` support (CSS + TS).
- Focus keyboard show/hide: resize the native window **once**, animate content with `transform` / `opacity` (compositor-friendly).
- Collapse / height-ratio paths that still resize the window: time-based ~16 ms native interpolation (not fixed 60 ms steps).
- Dictation waveform: no React render per frame; animate `scaleY` / `opacity` via refs.
- Stop whole-store Zustand re-renders on the remaining bare `useAppStore()` call sites.
- Preview + suggestions: React 19.3 `<ViewTransition>` instead of `max-width` layout animation.
- Dictation overlay: polish enter/exit to motion tokens; keep window size/position static.
- Mode menu: enter **and exit** with compositor `opacity`/`transform` using motion tokens; keep instant window expand/restore (already resize-once).
- Collapsed FAB stack: short staggered opacity/scale when the stack appears (Mic → Settings → R).
- Profile and meet #204 acceptance criteria on Windows (battery laptop + low-end if available).

## 2. Non-goals

- No new animation library (Motion, GSAP, Lottie, Pixi, etc.) unless later profiling forces a fallback.
- No Chromium / WebView2 GPU flags (`additionalBrowserArgs`).
- No acrylic / mica / `windowEffects`.
- No WebGL / wgpu / native GPU overlay toolkit.
- No Canvas 2D waveform unless Phase 1+2 profiling still shows main-thread cost after ref/`scaleY` work.
- Companion / Android keyboard motion (desktop Reach Panel only).

## 3. Context

Related work already on `dev`:

- [#219](https://github.com/pountzas/reach-Panel/pull/219) — shared dictation overlay window + content enter/exit.
- [#220](https://github.com/pountzas/reach-Panel/pull/220) — `PreviewSuggestionsRow` with always-mounted slots and `max-width` transitions (layout property; to be replaced).
- `CollapsedFab` already uses per-field store selectors.
- `ModeMenu` has enter-only opacity/`translateX` (150 ms hard-coded) and inline `matchMedia`; exit is instant unmount. Window expand via `cmd_expand_window_for_mode_menu` is already an instant apply (not the 60 ms morph).
- FAB buttons use `hover:scale-*` / `active:scale-95` (already compositor-safe); stack appear has no stagger.

Still open (this spec):

- No `src/lib/motion.ts` / `--rp-dur-*` tokens.
- `animate_window_layout` uses `COLLAPSE_ANIMATION_FRAME_MS = 60` step loop (~16 fps).
- `FocusModeShell` hard-swaps FAB ↔ keyboard; `syncFocusModeWindowLayout` animates native bounds for show/hide.
- `DictationVisualizer` calls `setLevels` every rAF and animates `height`.
- Seven components still destructure the whole store.
- Music-note chip and UpdatePrompt progress still animate layout/paint-heavy properties; unused `src/App.css` remains.
- Mode menu exit animation; FAB stack enter stagger.

Naming: product “Focus mode” (`focusMode.ts`, `FocusModeShell`); issue text’s “mini mode” maps to Focus.

## 4. Decision summary

| Topic | Choice |
| --- | --- |
| Shared tokens | CSS vars + `src/lib/motion.ts` (`MOTION`, `prefersReducedMotion`) |
| Focus show/hide | Apply final window layout once + CSS content slide/fade |
| Remaining native morphs | Time-based loop, `WINDOW_ANIMATION_FRAME_MS = 16`, exact final frame |
| High-res Windows timer | Not in first cut; only if profiling shows uneven pacing |
| Waveform | Imperative `transform`/`opacity` on bar refs |
| Preview / suggestions | React 19.3 `<ViewTransition>` + `startTransition` on visibility toggles |
| VT fallback | Compositor CSS (`opacity`/`transform` only) if transparent WebView misbehaves |
| Overlay | Existing window; content-only motion tokens; no window resize anim |
| Mode menu | Keep instant window expand/restore; content enter + exit (`opacity`/`translateX`); tokens + shared reduced-motion |
| FAB stack appear | Stagger opacity + slight `scale` (Mic → Settings → R); hover/press scales unchanged |
| Libraries / GPU flags | None |

## 5. Architecture

```
motion.ts / index.css tokens
        │
        ├─► FocusModeShell ── apply layout once ──► content translateY/opacity
        │         ▲
        │         └── isAnimatingWindow / pendingFocusLayoutSync (unchanged queue)
        │
        ├─► appStore native callers (collapse, height) ──► cmd_animate_window_layout
        │         └── reduced motion ──► cmd_apply_window_layout
        │
        ├─► DictationVisualizer (toolbar + DictationOverlay)
        ├─► PreviewSuggestionsRow (<ViewTransition>)
        ├─► ModeMenu (enter/exit) + CollapsedFab stagger
        └─► misc CSS (pulses, UpdatePrompt)
```

### 5.1 Motion tokens — `src/lib/motion.ts` + `src/index.css`

CSS variables:

- `--rp-dur-fast: 120ms`
- `--rp-dur-base: 200ms`
- `--rp-dur-slow: 300ms`
- `--rp-ease-out: cubic-bezier(0.22, 1, 0.36, 1)` (match music-strip curve)

`@media (prefers-reduced-motion: reduce)`:

- Set duration tokens to `1ms`
- `animation: none` on `.music-note-chip-active` and `.partiture-note-active .partiture-note-ring`

TS exports:

- `MOTION = { fast: 120, base: 200, slow: 300 }` (ms)
- `prefersReducedMotion(): boolean` via `window.matchMedia("(prefers-reduced-motion: reduce)")`

Tests: `src/lib/motion.test.ts` with mocked `matchMedia`.

### 5.2 Focus show/hide — resize once, animate content

**Show**

1. `cmd_apply_window_layout` → full-width bottom strip (no native interpolate).
2. Keep FAB + keyboard layers mounted; keyboard starts at `transform: translateY(100%)`, transitions to `translateY(0)` over `--rp-dur-slow`.
3. FAB fades out with `opacity`.

**Hide**

1. Keyboard → `translateY(100%)` + `opacity: 0`.
2. On `transitionend` (or timeout = `MOTION.slow`), `cmd_apply_window_layout` → FAB bounds.
3. FAB fades in.

**Semantics**

- Transparent window: empty region during slide is invisible.
- Preserve `isAnimatingWindow` and `pendingFocusLayoutSync` so overlapping requests still queue.
- `prefersReducedMotion()`: skip content transitions; apply final layout + final UI state immediately.
- Interrupt: cancel prior transition timeout; latest visibility wins via existing queue.

Primary files: `src/components/layout/FocusModeShell.tsx`, `src/stores/appStore.ts` (`syncFocusModeWindowLayout`).

### 5.3 Native window animation (collapse / height-ratio)

Files: `src-tauri/src/window/mod.rs`, `src-tauri/src/lib.rs` (`animate_window_layout`).

- Rename `COLLAPSE_ANIMATION_FRAME_MS` → `WINDOW_ANIMATION_FRAME_MS = 16`.
- Replace step index loop with time-based progress: `Instant::now()` at start; each iteration `progress = elapsed / duration` clamped to `1.0`; apply interpolated layout; sleep ~16 ms; stop at `1.0`; always apply exact target last.
- Durations unchanged: collapse 400 ms, Focus-related native duration constant 300 ms where still used for non–show/hide morphs.
- TS: for animate callers that remain, use `cmd_apply_window_layout` when `prefersReducedMotion()`.
- Keep existing `interpolate_layout` / `compute_window_layout` tests; add `interpolate_layout(from, to, 1.0) == to`.
- Do **not** add high-resolution waitable timer / `tokio-hrtime` unless post-change profiling shows uneven pacing.

### 5.4 DictationVisualizer

File: `src/components/keyboard/DictationVisualizer.tsx`.

- Render 28 `<span>` bars once with fixed `height: MAX_BAR` and `transform-origin: center`.
- Hold `useRef<(HTMLSpanElement | null)[]>` (or equivalent); rAF tick writes:

  - `el.style.transform = \`scaleY(${(MIN_BAR + level * (MAX_BAR - MIN_BAR)) / MAX_BAR})\``
  - `el.style.opacity = String(0.55 + level * 0.45)`

- No `setLevels` per frame; remove height/opacity CSS transitions on bars.
- `will-change: transform` on the bar container only while `active`.
- Reduced motion: no idle-shimmer rAF; static bars at ~0.15.
- Used by toolbar dictation UI and `DictationOverlay` — one implementation serves both.

### 5.5 Zustand selectors

Replace bare `useAppStore()` destructuring with per-field selectors or `useShallow` in:

- `DictationButton.tsx`
- `ErrorBanner.tsx`
- `InputAreaViewButtons.tsx`
- `SettingsPanel.tsx`
- `QuickActionEditor.tsx`
- `MousePanel.tsx`
- `MacroBuilder.tsx`

`CollapsedFab` already done — leave as-is unless a touch-up is needed for consistency.

### 5.6 Small CSS / cleanup

- `.music-note-chip`: remove `font-size` and `box-shadow` from `transition`; active size via `transform: scale(...)` (pulse already uses scale).
- `UpdatePrompt` progress bar: `transform: scaleX(p)` + `transform-origin: left` instead of animating `width` with `transition-all`.
- Delete unused `src/App.css` (not imported; only `src/index.css` is).
- Never put `filter` / `backdrop-filter: blur()` on or behind the live-preview `<img>`.

### 5.7 PreviewSuggestionsRow — ViewTransition

File: `src/components/keyboard/PreviewSuggestionsRow.tsx` (+ tests).

- Remove `max-width` / margin layout transitions from #220.
- Wrap preview and suggestions slots in `<ViewTransition>` from `react`.
- Enter/exit styling: opacity + slight horizontal translate via view-transition classes; disable or snap under `prefers-reduced-motion` (React does not do this automatically).
- Visibility toggles that drive show/hide must run inside `startTransition`. Do **not** wrap `inputPreviewFrame` updates.
- Keep: always-mounted slots, last-chips ref, `inert` / `aria-hidden` / `pointer-events-none` when hidden, centered flex row, height = max not sum (already from #220).
- Fallback if VT fails with transparent WebView: compositor-only CSS (`opacity`/`transform`), no `max-width`. Record choice in the PR.

### 5.8 Dictation overlay polish

Files: `src/components/keyboard/DictationOverlay.tsx`, tokens from §5.1.

- Keep create-once window, show/hide only, `setIgnoreCursorEvents` as today, no window size/position animation.
- Enter/exit: `transition-[opacity,transform]` using `--rp-dur-base` / `--rp-ease-out` (replace hard-coded `duration-200` / `transition-all` if present).
- Waveform improvements come from §5.4.

### 5.9 Mode menu — enter + exit

Files: `src/components/layout/ModeMenu.tsx`, `src/components/layout/CollapsedFab.tsx`, `src/stores/appStore.ts` (`openModeMenu` / `closeModeMenu`).

**Window (unchanged pattern)**

- Open: `cmd_expand_window_for_mode_menu` — instant apply to menu-sized bounds (already resize-once).
- Close: after content exit finishes, restore FAB/layout via existing `syncFocusModeWindowLayout(false)` / `syncWindowLayoutFromSettings(..., false)` (instant apply).

**Content**

- Replace hard-coded 150 ms and inline `matchMedia` with `MOTION.fast` (120 ms) + `--rp-ease-out` and `prefersReducedMotion()`.
- **Enter:** mount menu → start at `opacity: 0` + `translateX(8px)` → transition to rest (same as today, tokenized).
- **Exit:** do not unmount immediately when `modeMenuOpen` becomes false. Keep menu mounted in an exiting state (`opacity: 0` + `translateX(8px)`), then on `transitionend` (or timeout = `MOTION.fast`) unmount and run the window restore. `closeModeMenu` must await this exit (or a short local exit promise in the shell) before applying restored bounds so the menu does not jump while the window shrinks.
- Reduced motion: skip enter/exit transitions; unmount + restore immediately.
- Interrupt: opening again during exit cancels exit timeout and re-enters; closing during enter starts exit from current styles.

### 5.10 Collapsed FAB stack stagger

File: `src/components/layout/CollapsedFab.tsx`.

- When the collapsed FAB stack becomes the visible Focus chrome (keyboard hidden / collapse complete), animate each button in with compositor props only:
  - Properties: `opacity` + `transform: scale(0.92 → 1)` (or `translateY(4px → 0)` — pick scale; keep one axis of motion).
  - Duration: `MOTION.fast` / `--rp-dur-fast`; easing `--rp-ease-out`.
  - Stagger: Mic (if shown) → Settings (if shown) → R, **40 ms** between starts (total still well under `--rp-dur-base`).
- Hover/press scales (`hover:scale-[1.03]`, `active:scale-95`) stay; use `motion-reduce:` / `prefersReducedMotion()` so stagger and hover motion snap off when reduced motion is on.
- Do **not** stagger on every re-render — only on stack appear (e.g. mount or a one-shot `entered` flag when `FocusModeShell` shows the FAB layer).
- When Focus show fades the FAB stack out as a group (§5.2), group opacity is enough; no reverse stagger required.

## 6. Error handling & concurrency

- Focus content animation interrupted by a new show/hide: cancel prior timeout; reuse `pendingFocusLayoutSync` / `isAnimatingWindow`.
- Native animate loop always ends on exact target bounds.
- Overlay hide during enter: existing guards; reduced motion → instant final enter/exit state.
- Audio / visualizer failures: keep current catch path (static bars); do not reintroduce per-frame React state for the happy path.
- Mode menu: `closeModeMenu` still waits for in-flight `modeMenuExpandPending` before restore; additionally wait for content exit. Rapid open/close must not leave `modeMenuOpen` desynced from mounted UI.
- FAB stagger: if the stack unmounts mid-stagger (user expanded keyboard), cancel pending stagger timers; no orphan timeouts.

## 7. Testing & acceptance

**Automated**

- `src/lib/motion.test.ts` — mocked `matchMedia`.
- Rust: existing layout tests green + `interpolate_layout(..., 1.0) == to`.
- Focus shell: transition / reduced-motion behavior (unit or RTL as fits existing patterns).
- `PreviewSuggestionsRow`: last chips + VT (or CSS fallback) wiring; no regression on inert/hidden slots.
- `DictationVisualizer`: no per-frame `setState` (spy or assert style writes); reduced-motion static.
- Selector refactors: existing component tests still pass; add only where coverage is missing for hot paths.
- Mode menu: exit keeps menu mounted until transition/timeout; restore invoke happens after exit; reduced-motion path instant (extend `appStore.modeMenu.test.ts` / CollapsedFab tests as needed).
- FAB stagger: appear applies staggered styles; reduced-motion shows final styles immediately.

**Manual / profiling** (from #204; record before/after in PR)

- DevTools Frame Rendering Stats ~60 fps during Focus show/hide, collapse/expand, height toggle, dictation 10 s, overlay show/hide, mode menu open/close, FAB stack appear.
- Performance: no main-thread task >16 ms during CSS/content animations; note layout cost if any remains on native resize anim.
- React Profiler: `DictationVisualizer` not re-rendering every frame; `DictationButton` / `CollapsedFab` not re-rendering on every live-preview frame.
- Focus show/hide ~300 ms; collapse ~400 ms wall time to final bounds.
- Layers: no permanent `will-change` explosion.
- Windows Animation effects Off (or emulate reduced motion): instant window changes, pulses off, static waveform, mode menu/FAB stagger snap, UI still usable.
- Task Manager: idle + dictating CPU/GPU not higher than before.
- Regressions: transparent Focus, click targets after anim, `npm test` + `cargo test`.

## 8. Implementation order

Suggested PR-sized slices (can be one PR if kept reviewable):

1. Motion tokens + `motion.ts` + reduced-motion CSS.
2. Time-based native animate loop + reduced-motion TS callers for remaining animate paths.
3. Focus resize-once + `FocusModeShell` content transition.
4. Mode menu enter/exit (tokens + await exit before window restore) + FAB stack stagger.
5. `DictationVisualizer` ref/`scaleY` + overlay token polish.
6. Zustand selector sweep.
7. Music-note / UpdatePrompt / delete `App.css`.
8. `PreviewSuggestionsRow` → `<ViewTransition>` (+ fallback if needed).
9. Profiling notes in PR.

## 9. Out of scope (deferred)

- High-resolution waitable timer / `tokio-hrtime` unless needed after step 2.
- Canvas 2D waveform, Lottie, native wgpu/egui overlays.
- Applying “resize once, animate content” to normal-mode collapse if time-based loop is already smooth enough (revisit only if profiling fails).
