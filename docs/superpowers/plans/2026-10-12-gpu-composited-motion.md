# GPU-composited UI motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship compositor-friendly motion for Reach Panel (#204): shared tokens + reduced motion, Focus resize-once content anim, time-based native morphs where needed, cheap waveform, store selectors, ModeMenu exit + FAB stagger, ViewTransition for preview/suggestions, overlay polish.

**Architecture:** CSS/`motion.ts` tokens drive all durations. Focus show/hide applies window bounds once and animates `FocusModeShell` layers with `transform`/`opacity`. Remaining collapse/height paths use a time-based ~16 ms Rust interpolate loop. Waveform writes bar styles in rAF. Preview row uses React 19.3 `<ViewTransition>`. Mode menu keeps instant window expand; content enters and exits before restore. FAB stack staggers on appear.

**Tech Stack:** React 19.3, TypeScript, Tailwind v4, Zustand 5, Tauri 2 / Rust (Windows), Vitest + Testing Library, cargo test.

## Global Constraints

- Windows-only product; do not add macOS/Linux paths.
- Spec: `docs/superpowers/specs/2026-10-11-gpu-composited-motion-design.md`
- Issue: https://github.com/pountzas/reach-Panel/issues/204
- Focus mode naming (`focusMode.ts`, `FocusModeShell`); not “mini mode”.
- No animation libraries, no `additionalBrowserArgs`, no acrylic/mica, no WebGL/wgpu.
- No high-res waitable timer / `tokio-hrtime` unless profiling after Task 2 still shows uneven pacing.
- PixiJS rejected (issue comment) — do not add.

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/index.css` | `--rp-dur-*` / `--rp-ease-out`; reduced-motion; music-chip transform; VT classes |
| `src/lib/motion.ts` | `MOTION`, `prefersReducedMotion()` |
| `src/lib/motion.test.ts` | matchMedia tests |
| `src-tauri/src/window/mod.rs` | `WINDOW_ANIMATION_FRAME_MS = 16`; interpolate test |
| `src-tauri/src/lib.rs` | Time-based `animate_window_layout` |
| `src/stores/appStore.ts` | Focus resize-once sequence; reduced-motion → apply; mode-menu exit wait; `startTransition` on suggestion visibility updates |
| `src/components/layout/FocusModeShell.tsx` | Dual-layer content slide/fade; resolve content-anim wait |
| `src/components/layout/ModeMenu.tsx` | Tokenized enter/exit |
| `src/components/layout/CollapsedFab.tsx` | Keep menu through exit; FAB stagger |
| `src/components/keyboard/DictationVisualizer.tsx` | Refs + `scaleY` |
| `src/components/keyboard/DictationOverlay.tsx` | Motion tokens; `transition-[opacity,transform]` |
| `src/components/keyboard/PreviewSuggestionsRow.tsx` | `<ViewTransition>` |
| `src/components/keyboard/PreviewSuggestionsRow.test.tsx` | Update assertions for VT / no max-w |
| `src/components/keyboard/DictationButton.tsx` (+ 6 others) | Store selectors |
| `src/components/common/UpdatePrompt.tsx` | `scaleX` progress |
| `src/App.css` | Delete |

---

### Task 1: Motion tokens + `prefersReducedMotion`

**Files:**
- Create: `src/lib/motion.ts`
- Create: `src/lib/motion.test.ts`
- Modify: `src/index.css`

**Interfaces:**
- Produces:
  - `export const MOTION = { fast: 120, base: 200, slow: 300 } as const`
  - `export function prefersReducedMotion(): boolean`

- [ ] **Step 1: Write failing tests**

Create `src/lib/motion.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/motion.test.ts`
Expected: FAIL — cannot find module `./motion`

- [ ] **Step 3: Implement `motion.ts` + CSS tokens**

Create `src/lib/motion.ts`:

```ts
export const MOTION = {
  fast: 120,
  base: 200,
  slow: 300,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

In `src/index.css`, inside `:root` (after existing font rules), add:

```css
  --rp-dur-fast: 120ms;
  --rp-dur-base: 200ms;
  --rp-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --rp-dur-slow: 300ms;
```

At end of file (before or after existing rules), add:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --rp-dur-fast: 1ms;
    --rp-dur-base: 1ms;
    --rp-dur-slow: 1ms;
  }

  .music-note-chip-active {
    animation: none;
  }

  .partiture-note-active .partiture-note-ring {
    animation: none;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/motion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/motion.ts src/lib/motion.test.ts src/index.css
git commit -m "feat: add shared motion tokens and prefersReducedMotion"
```

---

### Task 2: Time-based native window animation

**Files:**
- Modify: `src-tauri/src/window/mod.rs` (constants ~151–154; tests module)
- Modify: `src-tauri/src/lib.rs` (`animate_window_layout` ~396–445)
- Modify: `src/stores/appStore.ts` (animate call sites that remain)

**Interfaces:**
- Consumes: `interpolate_layout`, `COLLAPSE_ANIMATION_MS`, `FOCUS_MODE_ANIMATION_MS`
- Produces: `WINDOW_ANIMATION_FRAME_MS = 16` (replaces `COLLAPSE_ANIMATION_FRAME_MS`)

- [ ] **Step 1: Write failing Rust test**

In `src-tauri/src/window/mod.rs` `mod tests`, add:

```rust
#[test]
fn interpolate_layout_at_one_equals_target() {
    let from = WindowLayout {
        x: 0,
        y: 0,
        width: 100,
        height: 50,
    };
    let to = WindowLayout {
        x: 10,
        y: 20,
        width: 200,
        height: 80,
    };
    assert_eq!(interpolate_layout(from, to, 1.0), to);
}
```

- [ ] **Step 2: Run test (should pass already if lerp correct; keep as regression)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml interpolate_layout_at_one_equals_target`
Expected: PASS

- [ ] **Step 3: Rename frame constant + time-based loop**

In `window/mod.rs`:

```rust
pub const COLLAPSE_ANIMATION_MS: u64 = 400;
pub const FOCUS_MODE_ANIMATION_MS: u64 = 300;
/// Target sleep between SetWindowPos frames (~60 fps).
pub const WINDOW_ANIMATION_FRAME_MS: u64 = 16;
```

Remove `COLLAPSE_ANIMATION_FRAME_MS`. Grep and fix any remaining references.

Replace `animate_window_layout` body loop in `lib.rs` with:

```rust
    let animation_ms = if focus_mode {
        window::FOCUS_MODE_ANIMATION_MS
    } else {
        window::COLLAPSE_ANIMATION_MS
    };
    let duration = std::time::Duration::from_millis(animation_ms);
    let started = std::time::Instant::now();
    loop {
        let elapsed = started.elapsed();
        let progress = if duration.is_zero() {
            1.0
        } else {
            (elapsed.as_secs_f32() / duration.as_secs_f32()).clamp(0.0, 1.0)
        };
        let layout = window::interpolate_layout(from, target, progress);
        set_window_layout(app, layout).await?;
        if progress >= 1.0 {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(
            window::WINDOW_ANIMATION_FRAME_MS,
        ))
        .await;
    }
    // Exact final bounds (guards float clamp / last sleep overshoot).
    set_window_layout(app, target).await?;
    Ok(())
```

- [ ] **Step 4: Reduced-motion on remaining TS animate callers**

At top of `appStore.ts` import:

```ts
import { prefersReducedMotion } from "../lib/motion";
```

In `syncWindowLayoutFromSettings`:

```ts
  if (preferAnimate && !settings.collapsed && !prefersReducedMotion()) {
    await invoke("cmd_animate_window_layout", args);
  } else {
    await invoke("cmd_apply_window_layout", args);
  }
```

In `toggleCollapsed` animate invokes and the `visibilityChanged` animate invoke (~1539): wrap with `prefersReducedMotion() ? cmd_apply_window_layout : cmd_animate_window_layout` (same args). Leave Focus show/hide path for Task 3 (it will stop using animate).

- [ ] **Step 5: Run Rust + relevant JS tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/window/mod.rs src-tauri/src/lib.rs src/stores/appStore.ts
git commit -m "fix: make native window layout animation time-based at ~60fps"
```

---

### Task 3: Focus resize-once + content transition

**Files:**
- Modify: `src/stores/appStore.ts` (`syncFocusModeWindowLayout`, add content-anim wait helpers)
- Modify: `src/components/layout/FocusModeShell.tsx`
- Create or modify tests under `src/components/layout/` as fits existing patterns

**Interfaces:**
- Consumes: `cmd_apply_window_layout`, `MOTION.slow`, `prefersReducedMotion`
- Produces:
  - Store field `focusContentAnim: "idle" | "enter" | "exit"` (or equivalent)
  - `notifyFocusContentAnimDone()` called by shell when enter/exit CSS finishes
  - `syncFocusModeWindowLayout` never calls `cmd_animate_window_layout`

- [ ] **Step 1: Add store coordination**

Near other module-level focus sync state in `appStore.ts`:

```ts
let focusContentAnimWaiter: {
  resolve: () => void;
  promise: Promise<void>;
} | null = null;

function beginFocusContentAnimWait(): Promise<void> {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  focusContentAnimWaiter = { resolve, promise };
  return promise;
}

export function notifyFocusContentAnimDone(): void {
  const w = focusContentAnimWaiter;
  focusContentAnimWaiter = null;
  w?.resolve();
}
```

Add to store state + initial:

```ts
focusContentAnim: "idle" as "idle" | "enter" | "exit",
```

Rewrite `syncFocusModeWindowLayout`:

```ts
async function syncFocusModeWindowLayout(preferAnimate = true) {
  const state = useAppStore.getState();
  if (!state.focusModeActive) {
    pendingFocusLayoutSync = null;
    return;
  }
  if (state.isAnimatingWindow) {
    pendingFocusLayoutSync = preferAnimate;
    return;
  }

  const visibleAtStart = state.focusModeKeyboardVisible;
  const animateContent = preferAnimate && !prefersReducedMotion();
  useAppStore.setState({ isAnimatingWindow: true });
  try {
    const { settings } = useAppStore.getState();
    const args = {
      monitorId: settings.accessibilityMonitorId,
      collapsed: !visibleAtStart,
      collapsedDictation: settings.micMode === true,
      collapsedSettings: true,
      heightRatio: heightRatioFromSettings(
        settings,
        useAppStore.getState().musicTeachingEnabled,
      ),
      focusMode: true,
      focusKeyboardVisible: visibleAtStart,
      focusKeyboardHeightRatio: FOCUS_KEYBOARD_HEIGHT_RATIO,
      fullWorkArea: false,
    };

    if (visibleAtStart) {
      await invoke("cmd_apply_window_layout", args);
      if (animateContent) {
        const wait = beginFocusContentAnimWait();
        useAppStore.setState({ focusContentAnim: "enter" });
        await Promise.race([
          wait,
          new Promise<void>((r) => window.setTimeout(r, MOTION.slow + 50)),
        ]);
        useAppStore.setState({ focusContentAnim: "idle" });
      }
    } else {
      if (animateContent) {
        const wait = beginFocusContentAnimWait();
        useAppStore.setState({ focusContentAnim: "exit" });
        await Promise.race([
          wait,
          new Promise<void>((r) => window.setTimeout(r, MOTION.slow + 50)),
        ]);
        useAppStore.setState({ focusContentAnim: "idle" });
      }
      await invoke("cmd_apply_window_layout", args);
    }
  } finally {
    useAppStore.setState({ isAnimatingWindow: false, focusContentAnim: "idle" });
    const latest = useAppStore.getState();
    const queued = pendingFocusLayoutSync;
    pendingFocusLayoutSync = null;
    if (
      latest.focusModeActive &&
      (queued !== null || latest.focusModeKeyboardVisible !== visibleAtStart)
    ) {
      const nextAnimate = queued ?? preferAnimate;
      void syncFocusModeWindowLayout(nextAnimate);
    }
  }
}
```

Import `MOTION` from `../lib/motion`.

- [ ] **Step 2: Implement `FocusModeShell` dual layers**

Replace the hard FAB↔keyboard swap with:

```tsx
import { useEffect, useState } from "react";
import { KeyboardSection } from "../keyboard/KeyboardSection";
import { useAppStore, notifyFocusContentAnimDone } from "../../stores/appStore";
import { CollapsedFab } from "./CollapsedFab";
import { MOTION } from "../../lib/motion";

export function FocusModeShell() {
  const focusModeKeyboardVisible = useAppStore((s) => s.focusModeKeyboardVisible);
  const focusContentAnim = useAppStore((s) => s.focusContentAnim);
  const settings = useAppStore((s) => s.settings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const expandFocusModeKeyboard = useAppStore((s) => s.expandFocusModeKeyboard);

  const showKeyboardLayer =
    focusModeKeyboardVisible || focusContentAnim === "exit";
  const showFabLayer =
    !focusModeKeyboardVisible || focusContentAnim === "enter";

  const [keyboardSlideIn, setKeyboardSlideIn] = useState(
    focusModeKeyboardVisible && focusContentAnim === "idle",
  );

  useEffect(() => {
    if (focusContentAnim === "enter") {
      setKeyboardSlideIn(false);
      const raf = requestAnimationFrame(() => setKeyboardSlideIn(true));
      return () => cancelAnimationFrame(raf);
    }
    if (focusContentAnim === "exit") {
      setKeyboardSlideIn(false);
      return;
    }
    setKeyboardSlideIn(focusModeKeyboardVisible);
  }, [focusContentAnim, focusModeKeyboardVisible]);

  useEffect(() => {
    if (focusContentAnim !== "enter" && focusContentAnim !== "exit") return;
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      notifyFocusContentAnimDone();
    };
    const root = document.getElementById("focus-keyboard-layer");
    root?.addEventListener("transitionend", onEnd);
    const fallback = window.setTimeout(
      () => notifyFocusContentAnimDone(),
      MOTION.slow + 50,
    );
    return () => {
      root?.removeEventListener("transitionend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [focusContentAnim]);

  const bg = settings.focusModeTransparent
    ? "transparent"
    : (settings.appBgColor ?? "#f1f5f9");

  const layerTransition =
    "transition-[transform,opacity] [transition-duration:var(--rp-dur-slow)] [transition-timing-function:var(--rp-ease-out)] motion-reduce:transition-none";

  return (
    <div className="relative h-full w-full" style={{ background: "transparent" }}>
      {showFabLayer && (
        <div
          className={`absolute inset-0 ${layerTransition} ${
            focusModeKeyboardVisible && keyboardSlideIn
              ? "pointer-events-none opacity-0"
              : "opacity-100"
          }`}
        >
          <CollapsedFab
            showSettings
            showDictation={settings.micMode === true}
            onSettings={() => void setShowSettings(true)}
            onExpand={() => void expandFocusModeKeyboard()}
          />
        </div>
      )}
      {showKeyboardLayer && (
        <div
          id="focus-keyboard-layer"
          className={`absolute inset-0 flex flex-col ${layerTransition} ${
            keyboardSlideIn
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0"
          } ${focusModeKeyboardVisible && keyboardSlideIn ? "" : "pointer-events-none"}`}
          style={{
            width: "100vw",
            height: "100vh",
            backgroundColor: bg,
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="min-h-0 flex-1">
            <KeyboardSection />
          </div>
        </div>
      )}
    </div>
  );
}
```

Ensure `notifyFocusContentAnimDone` fires once per enter/exit (guard with a local `done` flag if `transitionend` + timeout both fire).

- [ ] **Step 3: Manual sanity + unit smoke**

Run existing focus/mode tests: `npm test -- src/stores/appStore.modeMenu.test.ts src/lib/focusMode.test.ts`
Expected: PASS (adjust mocks if new state fields break store setup).

- [ ] **Step 4: Commit**

```bash
git add src/stores/appStore.ts src/components/layout/FocusModeShell.tsx
git commit -m "feat: resize Focus window once and animate keyboard/FAB content"
```

---

### Task 4: Mode menu exit + FAB stack stagger

**Files:**
- Modify: `src/components/layout/ModeMenu.tsx`
- Modify: `src/components/layout/CollapsedFab.tsx`
- Modify: `src/stores/appStore.ts` (`closeModeMenu`)
- Modify: `src/stores/appStore.modeMenu.test.ts`, `src/components/layout/CollapsedFab.test.tsx`

**Interfaces:**
- Consumes: `MOTION.fast`, `prefersReducedMotion`
- Produces: ModeMenu exit before window restore; FAB stagger on mount appear

- [ ] **Step 1: Extend mode-menu tests**

In `appStore.modeMenu.test.ts`, add a test that `closeModeMenu` waits ~`MOTION.fast` before restore when motion is allowed — mock `prefersReducedMotion` to return `false` and fake timers, OR inject a short delay assertion that `cmd_apply_window_layout` / `syncFocusModeWindowLayout` path is not invoked until after exit delay.

Simplest approach: mock `../lib/motion`:

```ts
vi.mock("../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300 },
  prefersReducedMotion: () => false,
}));
```

Use `vi.useFakeTimers()`; start `closeModeMenu()`; assert restore invoke not yet; `await vi.advanceTimersByTimeAsync(120)`; then assert restore ran.

When `prefersReducedMotion: () => true`, restore runs without waiting.

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- src/stores/appStore.modeMenu.test.ts`
Expected: FAIL on new wait assertions

- [ ] **Step 3: ModeMenu enter/exit + CollapsedFab keep-alive**

`ModeMenu.tsx`:

- Import `MOTION`, `prefersReducedMotion`.
- Props: add optional `onExitComplete?: () => void` OR drive purely from `modeMenuOpen` via parent.
- Prefer parent-owned lifecycle in `CollapsedFab`:

```tsx
const modeMenuOpen = useAppStore((s) => s.modeMenuOpen);
const [menuMounted, setMenuMounted] = useState(false);
const [menuEntered, setMenuEntered] = useState(false);

useEffect(() => {
  if (modeMenuOpen) {
    setMenuMounted(true);
    setMenuEntered(false);
    const id = requestAnimationFrame(() => setMenuEntered(true));
    return () => cancelAnimationFrame(id);
  }
  if (!menuMounted) return;
  if (prefersReducedMotion()) {
    setMenuMounted(false);
    setMenuEntered(false);
    return;
  }
  setMenuEntered(false);
  const t = window.setTimeout(() => {
    setMenuMounted(false);
  }, MOTION.fast);
  return () => window.clearTimeout(t);
}, [modeMenuOpen, menuMounted]);
```

Render `{menuMounted ? <ModeMenu ... entered={menuEntered} /> : null}`.

`ModeMenu` styles:

```ts
const reduce = prefersReducedMotion();
const show = entered || reduce;
// opacity: show ? 1 : 0
// transform: show ? translateX(0) : translateX(8px)
// transition: reduce ? undefined : `opacity ${MOTION.fast}ms var(--rp-ease-out), transform ${MOTION.fast}ms var(--rp-ease-out)`
```

`closeModeMenu`:

```ts
closeModeMenu: async () => {
  if (!get().modeMenuOpen) return;
  set({ modeMenuOpen: false });
  if (modeMenuExpandPending) await modeMenuExpandPending;
  if (!prefersReducedMotion()) {
    await new Promise<void>((r) => window.setTimeout(r, MOTION.fast));
  }
  if (get().focusModeActive) {
    await syncFocusModeWindowLayout(false);
  } else {
    await syncWindowLayoutFromSettings(
      get().settings,
      false,
      get().musicTeachingEnabled,
    );
  }
},
```

- [ ] **Step 4: FAB stagger**

In `CollapsedFab`, on mount (or when FAB layer becomes visible), set `stackEntered` false then rAF/timeouts:

```tsx
const [stackEntered, setStackEntered] = useState(false);
useEffect(() => {
  if (prefersReducedMotion()) {
    setStackEntered(true);
    return;
  }
  setStackEntered(false);
  const id = requestAnimationFrame(() => setStackEntered(true));
  return () => cancelAnimationFrame(id);
}, []);
```

Per-button style (Mic index 0, Settings 1, R last among shown):

```ts
const staggerMs = 40;
const delay = index * staggerMs;
style={{
  ...,
  opacity: stackEntered ? 1 : 0,
  transform: stackEntered ? "scale(1)" : "scale(0.92)",
  transition: prefersReducedMotion()
    ? undefined
    : `opacity ${MOTION.fast}ms var(--rp-ease-out) ${delay}ms, transform ${MOTION.fast}ms var(--rp-ease-out) ${delay}ms`,
}}
```

Keep existing hover/press scale classes; they compose with inline transform — if conflict, wrap inner icon scale on a child and keep stagger on outer, **or** use Tailwind `motion-safe:` classes with `delay-[0ms]` / `delay-[40ms]` / `delay-[80ms]` on each button.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/stores/appStore.modeMenu.test.ts src/components/layout/CollapsedFab.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ModeMenu.tsx src/components/layout/CollapsedFab.tsx src/stores/appStore.ts src/stores/appStore.modeMenu.test.ts src/components/layout/CollapsedFab.test.tsx
git commit -m "feat: animate mode menu exit and stagger collapsed FAB appear"
```

---

### Task 5: DictationVisualizer refs + overlay tokens

**Files:**
- Modify: `src/components/keyboard/DictationVisualizer.tsx`
- Modify: `src/components/keyboard/DictationOverlay.tsx`
- Create: `src/components/keyboard/DictationVisualizer.test.tsx` (if no test file exists)

**Interfaces:**
- Consumes: `prefersReducedMotion`, `MOTION` (overlay)
- Produces: bars updated via DOM, no per-frame React state

- [ ] **Step 1: Write failing test**

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { DictationVisualizer } from "./DictationVisualizer";

vi.mock("../../lib/motion", () => ({
  prefersReducedMotion: () => false,
  MOTION: { fast: 120, base: 200, slow: 300 },
}));

describe("DictationVisualizer", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not use height style on bars when active with captureAudio false", async () => {
    const { container } = render(
      <DictationVisualizer active captureAudio={false} />,
    );
    await vi.waitFor(() => {
      const bar = container.querySelector("span");
      expect(bar).toBeTruthy();
      expect((bar as HTMLElement).style.height).toBe(`${22 /* MAX_BAR */}px`);
      expect((bar as HTMLElement).style.transform).toMatch(/scaleY/);
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- src/components/keyboard/DictationVisualizer.test.tsx`
Expected: FAIL (height animated / no scaleY)

- [ ] **Step 3: Implement visualizer**

Replace levels-driven render with:

```tsx
const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
const MAX_BAR = 22;
const MIN_BAR = 3;

// In rAF tick (both capture and idle shimmer paths):
for (let i = 0; i < BAR_COUNT; i++) {
  const level = next[i] ?? 0.08;
  const el = barsRef.current[i];
  if (!el) continue;
  const scale = (MIN_BAR + level * (MAX_BAR - MIN_BAR)) / MAX_BAR;
  el.style.transform = `scaleY(${scale})`;
  el.style.opacity = String(0.55 + level * 0.45);
}
// Do not call setLevels in the tick.

// Reduced motion when active: cancel rAF; set static ~0.15 once.

// JSX:
<div className="..." style={{ willChange: active ? "transform" : undefined }}>
  {Array.from({ length: BAR_COUNT }, (_, index) => (
    <span
      key={index}
      ref={(el) => {
        barsRef.current[index] = el;
      }}
      className="w-[2.5px] rounded-full bg-red-400"
      style={{
        height: MAX_BAR,
        transformOrigin: "center",
        transform: "scaleY(0.08)",
        opacity: 0.55,
      }}
    />
  ))}
</div>
```

Remove per-bar `transition: height...`. Keep `active === false` → `return null` if that is current behavior.

- [ ] **Step 4: Overlay polish**

In `DictationOverlay.tsx`, replace `transition-all duration-200 ease-out` with:

```tsx
className={`... transition-[opacity,transform] motion-reduce:transition-none motion-reduce:translate-y-0 ${
  entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
}`}
style={{
  transitionDuration: "var(--rp-dur-base)",
  transitionTimingFunction: "var(--rp-ease-out)",
}}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/components/keyboard/DictationVisualizer.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/keyboard/DictationVisualizer.tsx src/components/keyboard/DictationVisualizer.test.tsx src/components/keyboard/DictationOverlay.tsx
git commit -m "perf: drive dictation waveform with compositor scaleY writes"
```

---

### Task 6: Zustand selector sweep

**Files:**
- Modify:
  - `src/components/keyboard/DictationButton.tsx`
  - `src/components/common/ErrorBanner.tsx`
  - `src/components/layout/InputAreaViewButtons.tsx`
  - `src/components/settings/SettingsPanel.tsx`
  - `src/components/quick-actions/QuickActionEditor.tsx`
  - `src/components/mouse/MousePanel.tsx`
  - `src/components/macros/MacroBuilder.tsx`

**Interfaces:**
- Consumes: `useAppStore((s) => s.field)` per field (or `useShallow` from `zustand/react/shallow` for object groups)
- Produces: same runtime behavior; no whole-store subscribe

- [ ] **Step 1: Convert hot-path components first**

`DictationButton.tsx`:

```tsx
const dictationState = useAppStore((s) => s.dictationState);
const toggleDictation = useAppStore((s) => s.toggleDictation);
const sttCapability = useAppStore((s) => s.sttCapability);
const refreshSttCapability = useAppStore((s) => s.refreshSttCapability);
const settings = useAppStore((s) => s.settings);
```

`ErrorBanner.tsx`:

```tsx
const lastError = useAppStore((s) => s.lastError);
const setLastError = useAppStore((s) => s.setLastError);
const setShowSettings = useAppStore((s) => s.setShowSettings);
```

Same pattern for `InputAreaViewButtons`, `MousePanel`, `QuickActionEditor`, `MacroBuilder`.

- [ ] **Step 2: SettingsPanel**

Replace the large `useAppStore()` destructure with per-field selectors (or one `useShallow` picking only the fields currently destructured). Do not subscribe to unused store slices.

Example for a cluster:

```tsx
import { useShallow } from "zustand/react/shallow";

const {
  settings,
  updateSettings,
  // ...only fields this component reads
} = useAppStore(
  useShallow((s) => ({
    settings: s.settings,
    updateSettings: s.updateSettings,
    // ...
  })),
);
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS (fix any tests that mocked bare `useAppStore()` without a selector — mirror `CollapsedFab.test.tsx` / `PreviewSuggestionsRow.test.tsx` selector-aware mocks)

- [ ] **Step 4: Commit**

```bash
git add src/components/keyboard/DictationButton.tsx src/components/common/ErrorBanner.tsx src/components/layout/InputAreaViewButtons.tsx src/components/settings/SettingsPanel.tsx src/components/quick-actions/QuickActionEditor.tsx src/components/mouse/MousePanel.tsx src/components/macros/MacroBuilder.tsx
git commit -m "perf: subscribe to appStore with selectors instead of whole store"
```

---

### Task 7: Music chip, UpdatePrompt, delete App.css

**Files:**
- Modify: `src/index.css` (`.music-note-chip` / `.music-note-chip-active`)
- Modify: `src/components/common/UpdatePrompt.tsx`
- Delete: `src/App.css`

- [ ] **Step 1: CSS music chip**

Replace `.music-note-chip` transition and active rules:

```css
.music-note-chip {
  transition:
    transform 280ms var(--rp-ease-out),
    opacity 280ms ease,
    background-color 280ms ease;
}

.music-note-chip-active {
  line-height: 1;
  transform: scale(1.55);
  animation: music-note-pulse 1.1s ease-in-out infinite;
}
```

Adjust `@keyframes music-note-pulse` to pulse relative to the active scale (e.g. 1.55 ↔ 1.7) — keep visual similar; **do not** set `font-size: 1.5rem` on active.

- [ ] **Step 2: UpdatePrompt progress**

Replace width bar (~221):

```tsx
<div
  className="mt-3 h-2 overflow-hidden rounded-full"
  style={{ backgroundColor: surface.insetBg }}
>
  <div
    className="h-full w-full origin-left rounded-full transition-transform duration-200"
    style={{
      transform: `scaleX(${Math.min(1, Math.max(0, progressPercent / 100))})`,
      backgroundColor: headerBg,
    }}
  />
</div>
```

- [ ] **Step 3: Delete `src/App.css`**

Confirm nothing imports it (`rg App.css` → only itself). Delete file.

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/components/common/UpdatePrompt.tsx
git rm src/App.css
git commit -m "perf: use transform for music chips and update progress; drop App.css"
```

---

### Task 8: PreviewSuggestionsRow → ViewTransition

**Files:**
- Modify: `src/components/keyboard/PreviewSuggestionsRow.tsx`
- Modify: `src/components/keyboard/PreviewSuggestionsRow.test.tsx`
- Modify: `src/stores/appStore.ts` (wrap suggestion-list updates in `startTransition`)
- Modify: `src/index.css` (view-transition class hooks if using named classes)

**Interfaces:**
- Consumes: `ViewTransition`, `startTransition` from `react`
- Produces: no `max-width` layout animation on slots

- [ ] **Step 1: Update tests for new slot classes**

Change tests that assert `max-w-0` / `max-w-[320px]` to assert VT presence and hidden-slot affordances:

```tsx
it("keeps both slots mounted when hidden", () => { /* unchanged */ });

it("marks hidden preview slot inert and aria-hidden", () => {
  const { container } = render(
    <PreviewSuggestionsRow showPreview={false} showSuggestions={false} />,
  );
  const previewSlot = container.querySelector("[data-slot='preview']");
  expect(previewSlot?.getAttribute("aria-hidden")).toBe("true");
});
```

Remove obsolete max-width class assertions. Keep last-chips test.

- [ ] **Step 2: Run — expect FAIL / update component**

- [ ] **Step 3: Implement ViewTransition row**

```tsx
import { ViewTransition, startTransition } from "react";
// startTransition is used at the store write sites, not necessarily here.

export function PreviewSuggestionsRow({ showPreview, showSuggestions }: ...) {
  // lastSuggestionsRef logic unchanged
  return (
    <div className="flex w-full min-w-0 items-center justify-center">
      <ViewTransition default="rp-vt-fade-slide">
        <div
          data-slot="preview"
          aria-hidden={!showPreview}
          inert={!showPreview}
          className={`min-w-0 shrink ${
            showPreview
              ? "w-[320px] opacity-100"
              : "pointer-events-none w-0 overflow-hidden opacity-0"
          }`}
          style={showPreview ? { width: PREVIEW_WIDTH } : { width: 0 }}
        >
          {showPreview || lastPreviewMounted ? <InputPreview /> : null}
        </div>
      </ViewTransition>
      {/* similar for suggestions; keep ml-2 when both shown; SuggestionsBar override */}
    </div>
  );
}
```

Prefer keeping always-mounted `InputPreview` as today if unmounting breaks VT; follow React 19.3 docs: wrap the changing subtree; use `enter`/`exit`/`update` class props (`default="none"` + custom classes) styled under `::view-transition-old/new` in `index.css` with `@media (prefers-reduced-motion: reduce) { ::view-transition-group(*) { animation: none !important; } }` (or project-equivalent).

If VT misbehaves with transparent WebView during manual check, fall back to opacity/transform CSS only (no `max-width`) and note in PR.

- [ ] **Step 4: `startTransition` on suggestion visibility writes**

In `appStore.ts`, import `startTransition` from `react`. For store updates that set `suggestions` to a new list or clear it (paths that flip `hasSuggestionChips`), wrap the `set(...)` in `startTransition(() => set(...))`.

**Do not** wrap `inputPreviewFrame` / live preview `setState` updates.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/components/keyboard/PreviewSuggestionsRow.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/keyboard/PreviewSuggestionsRow.tsx src/components/keyboard/PreviewSuggestionsRow.test.tsx src/stores/appStore.ts src/index.css
git commit -m "feat: animate preview and suggestions with ViewTransition"
```

---

### Task 9: Full test suite + profiling checklist in PR notes

**Files:** none required (docs only if recording numbers in PR body)

- [ ] **Step 1: Run full automated suite**

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS

- [ ] **Step 2: Manual profiling checklist** (dev build, Windows)

Record before/after briefly for the PR:

- [ ] Frame Rendering Stats ~60 fps: Focus show/hide, collapse/expand, height toggle, dictation 10 s, overlay, mode menu open/close, FAB appear
- [ ] Performance: no >16 ms main-thread tasks during CSS/content anims; note any layout cost on remaining native morph
- [ ] React Profiler: DictationVisualizer not re-rendering per frame; DictationButton/CollapsedFab not on every preview frame
- [ ] Durations ~300 ms Focus / ~400 ms collapse
- [ ] Layers: no permanent will-change explosion
- [ ] Reduced motion: instant window, no pulses, static waveform, no menu/FAB motion, usable
- [ ] Task Manager CPU/GPU not worse idle/dictating
- [ ] Transparent Focus + click targets OK

- [ ] **Step 3: Commit only if code fixes arose from profiling**

```bash
git commit -m "fix: address motion profiling follow-ups"
```

(Skip empty commit.)

---

## Self-review (plan vs spec)

| Spec section | Task |
| --- | --- |
| §5.1 Motion tokens | Task 1 |
| §5.2 Focus resize-once | Task 3 |
| §5.3 Native time-based loop | Task 2 |
| §5.4 DictationVisualizer | Task 5 |
| §5.5 Selectors | Task 6 |
| §5.6 CSS / App.css | Task 7 |
| §5.7 ViewTransition | Task 8 |
| §5.8 Overlay polish | Task 5 |
| §5.9 Mode menu exit | Task 4 |
| §5.10 FAB stagger | Task 4 |
| §7 Acceptance / profiling | Task 9 |

No TBD/TODO placeholders. Types: `focusContentAnim`, `MOTION`, `WINDOW_ANIMATION_FRAME_MS`, `notifyFocusContentAnimDone` used consistently. High-res timer deferred per spec.
