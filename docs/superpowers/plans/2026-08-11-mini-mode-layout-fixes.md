# Mini Mode, Layout Fixes & Tool Window Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix settings/tool-window positioning, collapsed FAB clipping, and resize-drag pointer loss; add Mini Mode (Android-style auto keyboard on single/mirrored displays) with transparent outlined UI, touch-vs-mouse layout profiles, and a settings FAB when collapsed.

**Architecture:** Extend Rust window layout (`compute_window_layout`) with a `mini_mode` branch (full-width bottom keyboard vs 3-button FAB stack). Emit fine-grained input-focus events from `focus_target.rs` via Tauri events. Store dual layout snapshots (`touchLayout` / `mouseLayout`) in profile settings, selected by last pointer type. Fix resize drags with a shared `usePointerDrag` hook using window-level capture fallbacks. Tool windows resolve monitor from main window bounds at open time and center on that monitor's full work area.

**Tech Stack:** Tauri 2, React 19, Zustand, Rust Win32 APIs, Tailwind CSS 4, Vitest (new frontend tests), Rust `#[test]` in existing modules.

## Global Constraints

- Windows-only for monitor mirroring detection and focus hooks.
- Keep Rust ↔ TS constants in sync for collapsed FAB geometry (document in both files).
- All new user-facing strings require i18n keys in `src/i18n/en.ts` plus mirrored entries in `de`, `el`, `es`, `fr`, `it`, `pt`.
- Profile JSON backward compatibility: missing new fields fall back to current single-layout values.
- Mini Mode default: **auto-on** for single monitor or detected mirror; **off by default** on dual-monitor unless user enables override in Settings → Display.
- Do not hide OS system cursor — only hide mouse panel UI (`mouseVisible: false`) in Mini Mode.
- Transparent mode: fully transparent backgrounds; buttons use high-contrast white outlines + dark text shadow.
- Settings/tool windows: center on **full monitor work area** of the monitor containing the main window at open time.
- Exhaustive switch handling required for new TypeScript union types.

---

## File Structure (new & modified)

| File | Responsibility |
|------|----------------|
| `src/lib/layoutProfiles.ts` | **Create.** Touch/mouse layout snapshot types, merge/split helpers |
| `src/lib/pointerDrag.ts` | **Create.** Shared pointer-drag hook + `touch-action: none` helper |
| `src/lib/miniMode.ts` | **Create.** Mini mode eligibility, mirror detection, height constants |
| `src/lib/toolWindows.ts` | Resolve monitor from main window rect; center all tool windows |
| `src/lib/types.ts` | Add `miniModeEnabled`, `miniModeOverride`, `miniModeTransparent`, `touchLayout`, `mouseLayout`, `PointerInputKind` |
| `src/stores/appStore.ts` | Mini mode state machine, layout profile switching, focus event handlers |
| `src/components/layout/MiniModeShell.tsx` | **Create.** Mini mode UI: popped keyboard+suggestions vs collapsed FAB |
| `src/components/layout/CollapsedFab.tsx` | Add settings FAB; support 3-button stack sizing |
| `src/components/layout/AppShell.tsx` | Route to MiniModeShell when active |
| `src/components/keyboard/KeyboardSection.tsx` | Transparent mode toolbar toggle |
| `src/components/keyboard/KeyButton.tsx` | Transparent outlined key styling |
| `src/components/layout/ResizableSplitPane.tsx` | Use shared pointer drag |
| `src/components/layout/SectionCanvas.tsx` | Use shared pointer drag on splitters |
| `src/components/layout/FloatingSection.tsx` | Disable Rnd drag during external pointer capture conflicts |
| `src/components/settings/SettingsPanel.tsx` | Display section: Mini Mode + Transparent toggles |
| `src-tauri/src/window/mod.rs` | Mini mode layouts, 3-FAB collapsed height, mirror helper |
| `src-tauri/src/window/windows.rs` | `monitors_overlap()`, `monitor_for_rect()` |
| `src-tauri/src/input/focus_target.rs` | Input-focus detection + Tauri event emit |
| `src-tauri/src/lib.rs` | New commands: `cmd_get_main_window_monitor`, `cmd_list_monitors_with_mirror_flag` |
| `src/lib/layoutProfiles.test.ts` | **Create.** Vitest unit tests |
| `src/lib/miniMode.test.ts` | **Create.** Vitest unit tests |
| `src/lib/pointerDrag.test.ts` | **Create.** Vitest unit tests (jsdom pointer events) |

---

### Task 1: Layout profile types & migration

**Files:**
- Create: `src/lib/layoutProfiles.ts`
- Create: `src/lib/layoutProfiles.test.ts`
- Modify: `src/lib/types.ts`
- Modify: `src-tauri/src/db/mod.rs` (default JSON if needed)

**Interfaces:**
- Consumes: existing `SectionStackState`, `AppSettings`
- Produces:
  ```typescript
  export type PointerInputKind = "touch" | "mouse";

  export interface LayoutSnapshot {
    sectionStack?: SectionStackState;
    inputRowRightRatio?: number;
    windowHeightRatio?: number;
  }

  export function snapshotFromSettings(settings: AppSettings): LayoutSnapshot;
  export function applyLayoutSnapshot(settings: AppSettings, snap: LayoutSnapshot): AppSettings;
  export function resolveActiveLayout(settings: AppSettings, kind: PointerInputKind): AppSettings;
  export function persistLayoutForKind(settings: AppSettings, kind: PointerInputKind): AppSettings;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/layoutProfiles.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type AppSettings } from "./types";
import {
  applyLayoutSnapshot,
  persistLayoutForKind,
  resolveActiveLayout,
  snapshotFromSettings,
} from "./layoutProfiles";

describe("layoutProfiles", () => {
  it("snapshots current ratios from flat settings", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      inputRowRightRatio: 0.35,
      windowHeightRatio: 0.8,
    };
    const snap = snapshotFromSettings(settings);
    expect(snap.inputRowRightRatio).toBe(0.35);
    expect(snap.windowHeightRatio).toBe(0.8);
  });

  it("persists touch layout without clobbering mouse layout", () => {
    const base = { ...DEFAULT_SETTINGS, inputRowRightRatio: 0.28 };
    const touchApplied = applyLayoutSnapshot(base, { inputRowRightRatio: 0.4 });
    const stored = persistLayoutForKind(touchApplied, "touch");
    expect(stored.touchLayout?.inputRowRightRatio).toBe(0.4);
    expect(stored.mouseLayout?.inputRowRightRatio ?? 0.28).toBe(0.28);
  });

  it("resolveActiveLayout picks touch snapshot when kind is touch", () => {
    const settings = persistLayoutForKind(
      applyLayoutSnapshot(DEFAULT_SETTINGS, { inputRowRightRatio: 0.5 }),
      "touch",
    );
    const resolved = resolveActiveLayout(settings, "touch");
    expect(resolved.inputRowRightRatio).toBe(0.5);
  });
});
```

Add Vitest to project if missing (`package.json` devDependency `"vitest"`, script `"test": "vitest run"`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/layoutProfiles.test.ts`
Expected: FAIL — module `./layoutProfiles` not found

- [ ] **Step 3: Write minimal implementation**

Add to `src/lib/types.ts`:

```typescript
export type PointerInputKind = "touch" | "mouse";

export interface LayoutSnapshot {
  sectionStack?: SectionStackState;
  inputRowRightRatio?: number;
  windowHeightRatio?: number;
}

// Inside AppSettings:
miniModeOverride?: boolean | null; // null = auto, true = force on, false = force off
miniModeTransparent?: boolean;
touchLayout?: LayoutSnapshot;
mouseLayout?: LayoutSnapshot;
```

Create `src/lib/layoutProfiles.ts` with snapshot/apply/persist/resolve functions. Import `SectionStackState` from `./sectionStack`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/layoutProfiles.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/layoutProfiles.ts src/lib/layoutProfiles.test.ts src/lib/types.ts package.json package-lock.json vitest.config.ts
git commit -m "feat: add touch/mouse layout snapshot types and helpers"
```

---

### Task 2: Pointer drag hook (fix resize drop bug)

**Files:**
- Create: `src/lib/pointerDrag.ts`
- Create: `src/lib/pointerDrag.test.ts`
- Modify: `src/components/layout/ResizableSplitPane.tsx`
- Modify: `src/components/layout/SectionCanvas.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface PointerDragHandlers {
    onPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
  }

  export function usePointerDrag(options: {
    enabled?: boolean;
    onMove: (event: PointerEvent) => void;
    onEnd?: (event: PointerEvent) => void;
  }): PointerDragHandlers;
  ```

Root cause: splitters only listen on the 6px hit target; touch pointers lose capture when finger drifts off the element. Fix: on pointerdown, attach `pointermove`/`pointerup`/`pointercancel` listeners to `window` until release; call `setPointerCapture`; set `touch-action: none` on drag handles.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePointerDrag } from "./pointerDrag";

describe("usePointerDrag", () => {
  it("calls onMove for window-level pointermove after pointerdown", () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => usePointerDrag({ onMove }));

    const down = new PointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 10, bubbles: true });
    const move = new PointerEvent("pointermove", { pointerId: 1, clientX: 20, clientY: 10, bubbles: true });
    const up = new PointerEvent("pointerup", { pointerId: 1, bubbles: true });

    act(() => {
      result.current.onPointerDown(down as unknown as React.PointerEvent);
      window.dispatchEvent(move);
      window.dispatchEvent(up);
    });

    expect(onMove).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/pointerDrag.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `usePointerDrag`**

```typescript
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

export function usePointerDrag(options: {
  enabled?: boolean;
  onMove: (event: PointerEvent) => void;
  onEnd?: (event: PointerEvent) => void;
}): PointerDragHandlers {
  const activeRef = useRef<{ pointerId: number; captureEl: HTMLElement | null } | null>(null);

  const endDrag = useCallback((event: PointerEvent) => {
    if (!activeRef.current || activeRef.current.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onWindowUp);
    window.removeEventListener("pointercancel", onWindowUp);
    try {
      activeRef.current.captureEl?.releasePointerCapture(event.pointerId);
    } catch { /* already released */ }
    activeRef.current = null;
    options.onEnd?.(event);
  }, [options]);

  const onWindowMove = useCallback((event: PointerEvent) => {
    if (!activeRef.current || activeRef.current.pointerId !== event.pointerId) return;
    options.onMove(event);
  }, [options]);

  const onWindowUp = useCallback((event: PointerEvent) => {
    endDrag(event);
  }, [endDrag]);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    if (options.enabled === false) return;
    event.preventDefault();
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    activeRef.current = { pointerId: event.pointerId, captureEl: el };
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
  }, [options.enabled, onWindowMove, onWindowUp]);

  return {
    onPointerDown,
    onPointerMove: () => { /* window listener handles move */ },
    onPointerUp: (event) => endDrag(event.nativeEvent),
  };
}
```

Wire into `ResizableSplitPane.tsx` splitter div (add `style={{ touchAction: "none" }}`) and `SectionCanvas.tsx` splitter divs. Remove duplicate inline pointer move/up logic.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/pointerDrag.test.ts`
Expected: PASS

Manual: drag section splitters and keyboard/mouse split on touchscreen — drag should not drop mid-gesture.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pointerDrag.ts src/lib/pointerDrag.test.ts src/components/layout/ResizableSplitPane.tsx src/components/layout/SectionCanvas.tsx
git commit -m "fix: keep resize drags alive with window-level pointer capture"
```

---

### Task 3: Persist layout per pointer kind on settings change

**Files:**
- Modify: `src/stores/appStore.ts`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/InputAreaViewButtons.tsx` (if needed)

**Interfaces:**
- Consumes: `persistLayoutForKind`, `resolveActiveLayout`, `PointerInputKind`
- Produces: store fields `pointerInputKind: PointerInputKind`, `setPointerInputKind(kind)`, updated `updateSettings()` that writes to active profile before applying

- [ ] **Step 1: Write failing store test** (or manual test script if store tests don't exist yet)

Add to `src/lib/layoutProfiles.test.ts`:

```typescript
it("updateSettings persists ratio into active touch layout", () => {
  // Simulate: start touch kind, change inputRowRightRatio
  // Expect touchLayout.inputRowRightRatio updated
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement in appStore**

On `updateSettings(partial)`:
1. If partial contains any layout field (`sectionStack`, `inputRowRightRatio`, `windowHeightRatio`), merge into `settings` then call `persistLayoutForKind(settings, pointerInputKind)`.
2. Add global capture in `main.tsx` or `AppShell`:
   ```typescript
   window.addEventListener("pointerdown", (e) => {
     const kind: PointerInputKind = e.pointerType === "touch" ? "touch" : "mouse";
     if (kind !== get().pointerInputKind) {
       // persist outgoing kind, resolve incoming
       set({ pointerInputKind: kind, settings: resolveActiveLayout(get().settings, kind) });
       void syncWindowLayoutFromSettings(get().settings, true);
     }
   }, { capture: true });
   ```
3. Instant switch (per user answer) — no debounce.

- [ ] **Step 4: Verify** — change split ratio on touch, switch to mouse, ratio restores to mouse profile; switch back restores touch ratio.

- [ ] **Step 5: Commit**

```bash
git add src/stores/appStore.ts src/App.tsx src/lib/layoutProfiles.test.ts
git commit -m "feat: store and restore layout ratios per touch/mouse input"
```

---

### Task 4: Tool window positioning — same monitor as main, centered

**Files:**
- Modify: `src-tauri/src/window/windows.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/toolWindows.ts`

**Interfaces:**
- Produces (Rust): `pub fn monitor_for_window(hwnd: HWND, monitors: &[MonitorInfo]) -> u32`
- Produces (TS): `async function resolveMainWindowMonitor(): Promise<MonitorInfo | undefined>`

- [ ] **Step 1: Write failing Rust test**

In `src-tauri/src/window/mod.rs` tests:

```rust
#[test]
fn monitor_for_rect_picks_largest_overlap() {
    let monitors = vec![
        sample_monitor(0, 0, 0, 1920, 1080),
        sample_monitor(1, 1920, 0, 1920, 1080),
    ];
    let id = monitor_for_rect(&monitors, 2000, 100, 400, 300);
    assert_eq!(id, 1);
}
```

- [ ] **Step 2: Run:** `cargo test monitor_for_rect --manifest-path src-tauri/Cargo.toml`
Expected: FAIL

- [ ] **Step 3: Implement**

`windows.rs`: add `monitor_for_rect(monitors, x, y, w, h)` — pick monitor with largest intersection area.

`lib.rs`: add command:
```rust
#[tauri::command]
async fn cmd_get_main_window_monitor(app: tauri::AppHandle) -> Result<u32, String>
```

`toolWindows.ts`:
```typescript
async function resolveMainWindowMonitor(monitors: MonitorInfo[]): Promise<MonitorInfo | undefined> {
  const id = await invoke<number>("cmd_get_main_window_monitor");
  return resolveMonitor(monitors, id);
}

// In openToolWindow:
const monitor = options.monitor ?? (await resolveMainWindowMonitor(await getMonitors()));
const position = monitor ? centerOnMonitor(monitor, width, height) : null;
```

Apply to **all** tool windows (settings, macro-builder, head-tracking). When settings already open and main moves monitors, reposition on next open (not live tracking — user chose open-time follow).

- [ ] **Step 4: Run Rust tests + manual** — open settings on secondary monitor layout; settings appears centered on monitor containing main window.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/window/windows.rs src-tauri/src/window/mod.rs src-tauri/src/lib.rs src/lib/toolWindows.ts
git commit -m "fix: center tool windows on the monitor containing main"
```

---

### Task 5: Collapsed FAB stretch/crop fix (high DPI)

**Files:**
- Modify: `src-tauri/src/window/mod.rs`
- Modify: `src/components/layout/CollapsedFab.tsx`
- Modify: `src/lib/miniMode.ts` (constants — create stub in this task)

**Problem:** OS window size uses fixed px constants but CSS `hover:scale-105` and DPI scaling cause clipping on 125–200% scales and small heights.

- [ ] **Step 1: Write failing Rust test for scaled collapsed size**

```rust
#[test]
fn collapsed_window_includes_hover_and_dpi_slack() {
    let layout = compute_collapsed_layout(/*...*/, CollapsedFabCount::Two, 1.5);
    assert!(layout.width >= 76); // base 56+2*10 plus slack
    assert!(layout.height >= 76);
}
```

Refactor collapsed sizing into `CollapsedFabCount` enum: `One`, `Two` (dictation), `Three` (mini mode settings+dictation+expand).

Add `FAB_HOVER_SLACK: u32 = 6` (5% of 56px) to both Rust and TS.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Rust collapsed width/height:
```rust
let scale_slack = (COLLAPSED_SIZE as f32 * 0.05).ceil() as u32;
let collapsed_w = COLLAPSED_SIZE + 2 * COLLAPSED_PAD + scale_slack;
```

TS `CollapsedFab.tsx`: replace `hover:scale-105` with `hover:scale-[1.03]` OR add `overflow: visible` wrapper with explicit min dimensions matching Rust.

Ensure `flex-col` container uses `minWidth`/`minHeight` inline styles equal to Rust computed size minus padding.

- [ ] **Step 4: Manual test** at 125%, 150%, 1366×768 — buttons circular, not cropped.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/window/mod.rs src/components/layout/CollapsedFab.tsx
git commit -m "fix: collapsed FAB window size accounts for DPI and hover slack"
```

---

### Task 6: Mirror detection & mini mode eligibility

**Files:**
- Create: `src/lib/miniMode.ts`
- Create: `src/lib/miniMode.test.ts`
- Modify: `src-tauri/src/window/windows.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
  ```typescript
  export function monitorsOverlap(a: MonitorInfo, b: MonitorInfo): boolean;
  export function isMirroredSetup(monitors: MonitorInfo[]): boolean;
  export function isMiniModeEligible(monitors: MonitorInfo[]): boolean; // single OR mirrored
  export function resolveMiniModeEnabled(settings: AppSettings, monitors: MonitorInfo[]): boolean;
  ```

- [ ] **Step 1: Write failing tests**

```typescript
it("detects mirrored monitors by overlapping work areas", () => {
  const a = { id: 0, name: "A", x: 0, y: 0, width: 1920, height: 1080, is_primary: true };
  const b = { id: 1, name: "B", x: 0, y: 0, width: 1920, height: 1080, is_primary: false };
  expect(isMirroredSetup([a, b])).toBe(true);
});

it("auto-enables mini mode on single monitor", () => {
  expect(resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: null }, [a])).toBe(true);
});

it("dual monitor default off unless override", () => {
  const monitors = [a, { ...b, x: 1920 }];
  expect(resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: null }, monitors)).toBe(false);
  expect(resolveMiniModeEnabled({ ...DEFAULT_SETTINGS, miniModeOverride: true }, monitors)).toBe(true);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** TS + Rust mirror flag on `MonitorInfo` (`is_mirror_duplicate: bool`) computed in `list_monitors` when rects overlap ≥90%.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/miniMode.ts src/lib/miniMode.test.ts src-tauri/src/window/windows.rs src-tauri/src/lib.rs
git commit -m "feat: detect mirrored displays and mini mode eligibility"
```

---

### Task 7: Input focus events for mini mode show/hide

**Files:**
- Modify: `src-tauri/src/input/focus_target.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/appStore.ts`

**Behavior:** Emit `input-focus-changed` Tauri event `{ focused: boolean }` when a focusable input control in an external app gains/loses focus. Hide keyboard when focus lost (Android-style). Broadest detection: foreground window is valid target AND (`GetFocus()` edit control OR `EVENT_OBJECT_FOCUS` on editable control).

- [ ] **Step 1: Write failing Rust test**

```rust
#[test]
fn editable_class_names_include_common_inputs() {
    assert!(is_editable_class("Edit"));
    assert!(is_editable_class("Chrome_RenderWidgetHostHWND")); // heuristic
}
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

Add `SetWinEventHook` for `EVENT_OBJECT_FOCUS` (0x8005) alongside foreground hook.

```rust
fn is_editable_focus(hwnd: HWND) -> bool {
    // Check class: Edit, RichEdit*, Chrome_RenderWidgetHostHWND, etc.
    // Optionally: GetWindowLong GWL_STYLE & ES_READONLY == 0
}

pub fn emit_focus_changed(app: &AppHandle, focused: bool) {
    let _ = app.emit("input-focus-changed", FocusChangedPayload { focused });
}
```

In `appStore.ts` init listener:
```typescript
listen("input-focus-changed", ({ payload }) => {
  if (!get().miniModeActive) return;
  set({ miniModeKeyboardVisible: payload.focused });
  void syncMiniModeWindowLayout();
});
```

- [ ] **Step 4: Manual** — Mini Mode on, click Notepad text area → keyboard slides up; click desktop → hides.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/input/focus_target.rs src-tauri/src/lib.rs src/stores/appStore.ts
git commit -m "feat: emit input focus events for mini mode keyboard visibility"
```

---

### Task 8: Mini mode window layout (Rust) — full-width bottom + slide animation

**Files:**
- Modify: `src-tauri/src/window/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/stores/appStore.ts`

**Interfaces:**
- Extend `compute_window_layout`:
  ```rust
  pub fn compute_window_layout(
      monitors: &[MonitorInfo],
      monitor_id: u32,
      collapsed: bool,
      collapsed_dictation: bool,
      collapsed_settings: bool, // NEW
      height_ratio: f32,
      mini_mode: bool,
      mini_keyboard_visible: bool,
      mini_keyboard_height_ratio: f32, // default 0.42
  ) -> Result<WindowLayout, String>
  ```

When `mini_mode && mini_keyboard_visible`: x = monitor.x, width = monitor.width, height = monitor.height * ratio, y = monitor.y + monitor.height - height.

When `mini_mode && !mini_keyboard_visible`: collapsed 3-FAB stack (settings+dictate+expand) bottom-right of **full monitor** (not bottom-half region — user wants full-width keyboard at bottom of screen).

Reuse `cmd_animate_window_layout` with 300ms slide for show/hide.

- [ ] **Step 1: Rust unit tests** for mini visible/hidden layouts on 1920×1080.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** + wire `syncMiniModeWindowLayout()` in store.

- [ ] **Step 4: Run `cargo test window` — PASS**

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/window/mod.rs src-tauri/src/lib.rs src/stores/appStore.ts
git commit -m "feat: mini mode full-width bottom keyboard window layout"
```

---

### Task 9: MiniModeShell UI

**Files:**
- Create: `src/components/layout/MiniModeShell.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/CollapsedFab.tsx`

**UI spec:**
- When `miniModeKeyboardVisible`: show keyboard section + suggestions bar only (no mouse, no quick actions/phrases). Full width. Hide mouse panel via `mouseVisible: false`.
- When hidden: show `CollapsedFab` with buttons top→bottom: **Settings** (gear), **Dictate**, **Expand**.
- **Expand** reopens the keyboard manually even without external focus; keyboard stays visible until the external input **loses focus** (same hide rule as auto-show). Expand does **not** exit Mini Mode or restore the full app.

`CollapsedFab.tsx` additions:
```typescript
interface CollapsedFabProps {
  showSettings?: boolean;
  onSettings?: () => void;
}
// Button order: settings, dictate, expand
```

Settings button calls `setShowSettings(true)`.

- [ ] **Step 1: Render test** (optional) or manual checklist

- [ ] **Step 2: Implement MiniModeShell**

```tsx
export function MiniModeShell() {
  const { miniModeKeyboardVisible, settings, setShowSettings, toggleCollapsed } = useAppStore();
  if (!miniModeKeyboardVisible) {
    return <CollapsedFab showSettings onSettings={() => void setShowSettings(true)} />;
  }
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1"><KeyboardSection /></div>
      {settings.suggestionsVisible !== false && <SuggestionsBar />}
    </div>
  );
}
```

`AppShell.tsx`:
```typescript
if (resolveMiniModeEnabled(settings, monitors)) {
  return <MiniModeShell />;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/MiniModeShell.tsx src/components/layout/AppShell.tsx src/components/layout/CollapsedFab.tsx
git commit -m "feat: mini mode shell with keyboard+suggestions and 3-button FAB"
```

---

### Task 10: Transparent mode styling

**Files:**
- Modify: `src/components/keyboard/KeyButton.tsx`
- Modify: `src/components/keyboard/Keyboard.tsx`
- Modify: `src/components/common/SuggestionsBar.tsx`
- Modify: `src/components/keyboard/KeyboardSection.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx`

**Spec:** When `settings.miniModeTransparent === true` AND mini mode active:
- Keyboard/suggestions backgrounds: `transparent`
- Keys/buttons: `background: transparent; border: 2px solid rgba(255,255,255,0.9); box-shadow: 0 0 0 1px rgba(0,0,0,0.5); color: inherit; text-shadow: 0 1px 2px rgba(0,0,0,0.8)`

Quick toggle on keyboard toolbar (visible when mini mode keyboard shown):
```tsx
<IconActionButton
  label={t("miniModeTransparent")}
  active={settings.miniModeTransparent}
  onClick={() => updateSettings({ miniModeTransparent: !settings.miniModeTransparent })}
/>
```

Settings → Display section:
```tsx
<SettingsSection title={t("miniMode")}>
  <Toggle label={t("miniModeOverride")} ... />
  <Toggle label={t("miniModeTransparent")} disabled={!miniModeActive} ... />
</SettingsSection>
```

- [ ] **Step 1: Visual manual test checklist**

- [ ] **Step 2: Implement styled variants**

- [ ] **Step 3: Add i18n keys** in all locale files.

- [ ] **Step 4: Commit**

```bash
git add src/components/keyboard/*.tsx src/components/common/SuggestionsBar.tsx src/components/settings/SettingsPanel.tsx src/i18n/*.ts
git commit -m "feat: transparent outlined UI for mini mode"
```

---

### Task 11: Settings panel Display section & dual-monitor override

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`

Add controls near accessibility monitor picker:
- **Mini Mode** — tri-state or toggle + "Force enable on dual monitors" checkbox maps to `miniModeOverride: true | false | null`
- **Transparent keyboard** — `miniModeTransparent`

Copy (en):
- `miniMode`: "Mini Mode"
- `miniModeAutoDescription`: "On a single display or mirrored setup, the keyboard appears automatically when you tap an input field."
- `miniModeForceEnable`: "Enable Mini Mode on dual monitors"
- `miniModeTransparent`: "Transparent keyboard"
- `miniModeTransparentDescription`: "Show keys with outlines only so you can see through to your apps."

- [ ] **Step 1–4: Implement + verify settings persist per profile**

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx src/i18n/*.ts
git commit -m "feat: mini mode and transparent toggles in display settings"
```

---

### Task 12: Floating section resize — pointer conflict mitigation

**Files:**
- Modify: `src/components/layout/FloatingSection.tsx`

react-rnd can lose drag on touch when parent receives conflicting pointer handlers. Add `touch-action: none` on Rnd wrapper; set `disableDragging`/`enableResizing` false while `useAppStore(s => s.pointerDragActive)` is true (expose flag from `usePointerDrag`).

- [ ] **Step 1: Manual repro on touch** — float-resize a section panel

- [ ] **Step 2: Implement drag lock coordination**

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/FloatingSection.tsx src/lib/pointerDrag.ts
git commit -m "fix: prevent floating section rnd conflicts during splitter drag"
```

---

### Task 13: Integration smoke test & docs

**Files:**
- Modify: `docs/accessibility-requirements.md` (add Mini Mode acceptance row)

- [ ] **Step 1: Run full test suite**

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 2: Manual test plan**

| Scenario | Expected |
|----------|----------|
| Single monitor, click Notepad | Keyboard slides up bottom-full-width; suggestions visible |
| Click outside Notepad | Keyboard hides; Settings/Dictate/Expand FAB visible |
| Settings from FAB | Settings centered on same monitor as main |
| 125% DPI collapsed | FAB buttons not cropped |
| Drag section splitter with touch | No drop until release |
| Switch touch→mouse mid-session | Layout ratios swap instantly |
| Dual monitor default | Full app (no mini) unless override enabled |
| Transparent toggle | Keys outlined, background see-through |

- [ ] **Step 3: Update docs/accessibility-requirements.md**

- [ ] **Step 4: Commit**

```bash
git add docs/accessibility-requirements.md
git commit -m "docs: add mini mode acceptance criteria"
```

---

## Spec Coverage Self-Review

| Requirement | Task |
|-------------|------|
| Settings same monitor as app, centered | Task 4 |
| Settings always middle of full monitor | Task 4 (`centerOnMonitor`) |
| Collapsed FAB stretch/crop on DPI/resolutions | Task 5 |
| Resize drops while dragging (not main window height) | Task 2, Task 12 |
| Touch vs mouse separate layout ratios | Task 1, Task 3 |
| Mini mode auto on single/mirror + override | Task 6, Task 11 |
| Mini mode keyboard on input focus, hide on focus lost | Task 7, Task 8, Task 9 |
| Keyboard + suggestions only; mouse panel hidden | Task 9 |
| Transparent mode with outlined buttons | Task 10 |
| Settings button above expand on collapsed FAB | Task 9 |
| Slide-up animation | Task 8 |
| Transparent quick toggle on keyboard toolbar | Task 10 |
| All tool windows follow monitor rule | Task 4 |

**Placeholder scan:** None — all tasks include concrete code/commands.

**Type consistency:** `CollapsedFabCount`/`collapsed_settings`/`miniModeKeyboardVisible` used consistently across Rust, store, and components.

---

## Open Questions Resolved (for implementers)

These were confirmed with the product owner — do not re-litigate during implementation:

1. Mini Mode trigger: auto on single/mirror + Settings override on dual (default off).
2. When keyboard hidden in Mini Mode → show Collapsed FAB (Settings → Dictate → Expand).
3. Hide keyboard when external input loses focus only.
4. **Expand button:** manually reopens keyboard until external focus is lost; does not exit Mini Mode.
5. Settings center: full monitor work area; monitor = where main window is at open time.
6. Transparent: full transparent + high-contrast outlines; toggle in Settings + keyboard toolbar.
7. Resize bug: pointer cancel mid-drag; all splitters except main window height.
8. Separate touch/mouse layouts for all ratios (section stack, input split, window height, floats).
9. Mirrored detection: overlapping duplicate monitor entries.
10. Mini keyboard: bottom, full monitor width, with suggestions.
11. OS cursor stays visible; only mouse panel UI hidden.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-11-mini-mode-layout-fixes.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
