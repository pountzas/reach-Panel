# Keep the panel window from ever being minimized Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `main` ReachPanel window cannot be OS-minimized or hidden, and Companion sessions switch the host to FAB mode instead of calling `minimize()`.

**Architecture:** Config + `configure_main_window` drop minimize style and the taskbar button. A Windows `stay_visible` module restores the HWND without stealing focus if Win+D still hides it. Companion emits session phase only; the frontend records `collapsed` on the restore stack and calls `setCollapsed(true|false)`.

**Tech Stack:** Tauri 2.12 (`set_minimizable`, `set_skip_taskbar`, `is_minimized`), `windows` 0.58 (`SetWinEventHook`, `ShowWindow(SW_SHOWNOACTIVATE)`, `SetWindowPos`), Zustand slices, Vitest, Rust `#[cfg(test)]`.

## Global Constraints

- Windows-only product; do not add macOS/Linux stubs or `#[cfg(not(target_os = "windows"))]`.
- Do not change `src-tauri/src/lib.rs`.
- Do not subclass the `main` HWND or intercept `WM_SYSCOMMAND` / `SC_MINIMIZE`.
- Do not add a tray icon.
- Do not call `cmd_apply_window_layout` / `cmd_animate_window_layout` from the stay-visible restore path.
- Restore without focus: `SW_SHOWNOACTIVATE` and `SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE`.
- No `minimize()` / `unminimize()` on the `main` window in `src-tauri/src` or `src/`.
- Do not log typed/dictated text, clipboard, settings JSON, or API keys.
- Spec: `docs/superpowers/specs/2026-11-05-no-minimize-panel-window-design.md`
- Issue: https://github.com/pountzas/reach-Panel/issues/370
- Branch: `fix/370-no-minimize` off `dev`; PR targets `dev`.

---

## File map

| Path | Responsibility |
| --- | --- |
| `src-tauri/tauri.conf.json` | `main` `minimizable: false`, `skipTaskbar: true` |
| `src-tauri/src/window/stay_visible.rs` | WinEvent hooks, restore, config + unit + ignored HWND tests |
| `src-tauri/src/window/mod.rs` | `mod stay_visible`; `configure_main_window` flags + `stay_visible::install` |
| `src-tauri/src/companion/server.rs` | Emit `companion-session` phase only; no window minimize |
| `src/stores/lib/restoreStack.ts` | Optional `collapsed?: boolean` on `RestorePatch` |
| `src/stores/types.ts` | `WindowSlice.setCollapsed` |
| `src/stores/slices/windowSlice.ts` | Extract `setCollapsed`; `toggleCollapsed` delegates |
| `src/stores/slices/companionSlice.ts` | Record/restore collapsed; enter FAB on session start |
| `src/stores/slices/modeSlice.ts` | Live Companion → `setCollapsed(true)`, not `minimize()` |
| `src/stores/slices/windowSlice.collapsed.test.ts` | Collapsed setter tests |
| `src/stores/slices/companionSlice.test.ts` | Session start/end FAB tests |
| `src/stores/appStore.setAppMode.test.ts` | Companion live session never calls `minimize` |
| `README.md` | Companion no longer OS-minimizes |

---

### Task 1: `main` window cannot be minimized and has no taskbar button

**Files:**
- Modify: `src-tauri/tauri.conf.json` (the `main` window object, currently lines 17–28)
- Modify: `src-tauri/src/window/mod.rs` (`configure_main_window`, currently lines 802–815)
- Create: `src-tauri/src/window/stay_visible.rs` (config test only in this task; hooks come in Task 2)

**Interfaces:**
- Consumes: Tauri 2 `WebviewWindow::set_minimizable(&self, minimizable: bool) -> Result<()>`, `WebviewWindow::set_skip_taskbar(&self, skip: bool) -> Result<()>`
- Produces: `main` config keys `minimizable: false`, `skipTaskbar: true`; `configure_main_window` calls those setters. `stay_visible.rs` exists so the config test has a home; `install` is a no-op until Task 2.

- [ ] **Step 1: Rename the branch**

```powershell
git branch -m fix/370-no-minimize
git status -sb
```

Expected: current branch is `fix/370-no-minimize`.

- [ ] **Step 2: Write the failing config test**

Create `src-tauri/src/window/stay_visible.rs`:

```rust
//! Keep the `main` panel visible: no minimize style, no taskbar button, restore on hide.

#[cfg(test)]
mod tests {
    #[test]
    fn main_window_config_disables_minimize_and_taskbar() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("tauri.conf.json");
        let windows = conf["app"]["windows"]
            .as_array()
            .expect("app.windows");
        let main = windows
            .iter()
            .find(|w| w["label"] == "main")
            .expect("main window");
        assert_eq!(main["minimizable"], false);
        assert_eq!(main["skipTaskbar"], true);
        assert_eq!(main["maximizable"], false);
        assert_eq!(main["alwaysOnTop"], true);
    }
}
```

In `src-tauri/src/window/mod.rs`, next to the other `mod` lines (after `pub(crate) mod events;`), add:

```rust
pub(crate) mod stay_visible;
```

Do not call `stay_visible` from `configure_main_window` yet.

- [ ] **Step 3: Run the config test — expect FAIL**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib main_window_config_disables_minimize_and_taskbar
```

Expected: FAIL, assertion on `minimizable` and/or `skipTaskbar` (those keys are absent, so JSON null ≠ false).

- [ ] **Step 4: Set the config flags and runtime setters**

In `src-tauri/tauri.conf.json`, change the `main` window object to:

```json
{
  "label": "main",
  "title": "ReachPanel",
  "width": 1200,
  "height": 700,
  "resizable": true,
  "maximizable": false,
  "minimizable": false,
  "decorations": false,
  "alwaysOnTop": true,
  "fullscreen": false,
  "transparent": true,
  "skipTaskbar": true
}
```

In `configure_main_window`, after `set_focusable(false)` and before `icon_sync::register_main_window_icon_sync`:

```rust
    let _ = window.set_minimizable(false);
    let _ = window.set_skip_taskbar(true);
```

Leave decorations, shadow, always-on-top, focusable, icon sync, and capture-exclude as they are.

- [ ] **Step 5: Re-run the config test — expect PASS**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib main_window_config_disables_minimize_and_taskbar
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/tauri.conf.json src-tauri/src/window/mod.rs src-tauri/src/window/stay_visible.rs
git commit -m "fix(window): disable minimize and skip the taskbar for main"
```

---

### Task 2: Stay-visible safety net

**Files:**
- Modify: `src-tauri/src/window/stay_visible.rs`
- Modify: `src-tauri/src/window/mod.rs` (`configure_main_window` — add `stay_visible::install(window)`)

**Interfaces:**
- Consumes: Task 1 config/setters; `window.hwnd()`; `crate::diagnostics::breadcrumbs`; `windows` 0.58 `SetWinEventHook`, `UnhookWinEvent`, `ShowWindow`, `SetWindowPos`, `EVENT_SYSTEM_MINIMIZESTART`, `EVENT_OBJECT_HIDE`, `WINEVENT_OUTOFCONTEXT`, `SW_SHOWNOACTIVATE`, `HWND_TOPMOST`, `SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE`
- Produces:
  - `pub(crate) enum VisibilityEvent { Minimize, Hide, Other }`
  - `pub(crate) fn should_restore(event: VisibilityEvent) -> bool`
  - `pub fn install<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>)`
  - `pub(crate) fn install_hooks_for_hwnd(hwnd: HWND) -> bool`
  - `pub(crate) fn uninstall()`
  - Breadcrumbs: `"stay_visible: restored after minimize"` and `"stay_visible: restored after hide"` with target `"window::stay_visible"`

- [ ] **Step 1: Write the failing `should_restore` tests**

Append to the `#[cfg(test)] mod tests` in `stay_visible.rs` (keep the config test). Add the enum + function as `super::` items the tests import — they will not compile until Step 3, which is the intended RED.

Replace the tests module with:

```rust
#[cfg(test)]
mod tests {
    use super::{should_restore, VisibilityEvent};

    #[test]
    fn main_window_config_disables_minimize_and_taskbar() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json")).expect("tauri.conf.json");
        let windows = conf["app"]["windows"]
            .as_array()
            .expect("app.windows");
        let main = windows
            .iter()
            .find(|w| w["label"] == "main")
            .expect("main window");
        assert_eq!(main["minimizable"], false);
        assert_eq!(main["skipTaskbar"], true);
        assert_eq!(main["maximizable"], false);
        assert_eq!(main["alwaysOnTop"], true);
    }

    #[test]
    fn restores_on_minimize() {
        assert!(should_restore(VisibilityEvent::Minimize));
    }

    #[test]
    fn restores_on_hide() {
        assert!(should_restore(VisibilityEvent::Hide));
    }

    #[test]
    fn does_not_restore_on_other() {
        assert!(!should_restore(VisibilityEvent::Other));
    }
}
```

- [ ] **Step 2: Run `should_restore` tests — expect FAIL (unresolved import / missing items)**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib restores_on_minimize
```

Expected: compile FAIL, `should_restore` / `VisibilityEvent` not found.

- [ ] **Step 3: Implement `should_restore`, hooks, restore, and `install`**

Write the production code in `src-tauri/src/window/stay_visible.rs`. Keep the tests module from Step 1 at the bottom of this same file (do not delete those four tests).

```rust
//! Keep the `main` panel visible: no minimize style, no taskbar button, restore on hide.

use crate::diagnostics::breadcrumbs;
use std::sync::Mutex;
use tauri::{WebviewWindow, WindowEvent};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, ShowWindow, UnhookWinEvent, EVENT_OBJECT_HIDE, EVENT_SYSTEM_MINIMIZESTART,
    HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE,
    WINEVENT_OUTOFCONTEXT,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum VisibilityEvent {
    Minimize,
    Hide,
    Other,
}

pub(crate) fn should_restore(event: VisibilityEvent) -> bool {
    matches!(event, VisibilityEvent::Minimize | VisibilityEvent::Hide)
}

struct HookState {
    hwnd: HWND,
    minimize_hook: HWINEVENTHOOK,
    hide_hook: HWINEVENTHOOK,
}

static STATE: Mutex<Option<HookState>> = Mutex::new(None);

fn event_from_win(event: u32) -> VisibilityEvent {
    if event == EVENT_SYSTEM_MINIMIZESTART {
        VisibilityEvent::Minimize
    } else if event == EVENT_OBJECT_HIDE {
        VisibilityEvent::Hide
    } else {
        VisibilityEvent::Other
    }
}

fn restore_now(hwnd: HWND, event: VisibilityEvent) {
    if !should_restore(event) {
        return;
    }
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
        );
    }
    let kind = match event {
        VisibilityEvent::Minimize => "minimize",
        VisibilityEvent::Hide => "hide",
        VisibilityEvent::Other => return,
    };
    breadcrumbs::debug(
        "window::stay_visible",
        format!("stay_visible: restored after {kind}"),
    );
}

pub(crate) fn uninstall() {
    let mut guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(state) = guard.take() {
        unsafe {
            let _ = UnhookWinEvent(state.minimize_hook);
            let _ = UnhookWinEvent(state.hide_hook);
        }
    }
}

fn hwnd_matches(stored: HWND, incoming: HWND) -> bool {
    stored.0 == incoming.0
}

unsafe extern "system" fn stay_visible_hook(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _id_thread: u32,
    _time: u32,
) {
    if hwnd.0 == 0 || id_object != 0 || id_child != 0 {
        return;
    }
    let visibility = event_from_win(event);
    if !should_restore(visibility) {
        return;
    }
    let stored = {
        let guard = STATE.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().map(|s| s.hwnd)
    };
    let Some(stored) = stored else {
        return;
    };
    if !hwnd_matches(stored, hwnd) {
        return;
    }
    restore_now(hwnd, visibility);
}

pub(crate) fn install_hooks_for_hwnd(hwnd: HWND) -> bool {
    uninstall();
    let minimize_hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_MINIMIZESTART,
            EVENT_SYSTEM_MINIMIZESTART,
            None,
            Some(stay_visible_hook),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    let hide_hook = unsafe {
        SetWinEventHook(
            EVENT_OBJECT_HIDE,
            EVENT_OBJECT_HIDE,
            None,
            Some(stay_visible_hook),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    if minimize_hook.is_invalid() || hide_hook.is_invalid() {
        log::error!("stay_visible: SetWinEventHook failed");
        unsafe {
            if !minimize_hook.is_invalid() {
                let _ = UnhookWinEvent(minimize_hook);
            }
            if !hide_hook.is_invalid() {
                let _ = UnhookWinEvent(hide_hook);
            }
        }
        return false;
    }
    *STATE.lock().unwrap_or_else(|e| e.into_inner()) = Some(HookState {
        hwnd,
        minimize_hook,
        hide_hook,
    });
    true
}

pub fn install<R: tauri::Runtime>(window: &WebviewWindow<R>) {
    let Ok(raw) = window.hwnd() else {
        log::error!("stay_visible: main hwnd unavailable");
        return;
    };
    let hwnd = HWND(raw.0);
    if !install_hooks_for_hwnd(hwnd) {
        return;
    }

    let window_for_events = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Resized(_) => {
            if window_for_events.is_minimized().unwrap_or(false) {
                if let Ok(raw) = window_for_events.hwnd() {
                    restore_now(HWND(raw.0), VisibilityEvent::Minimize);
                }
            }
        }
        WindowEvent::Destroyed => uninstall(),
        _ => {}
    });
}
```

Match HWND conversion to `src-tauri/src/window/icon_sync.rs` (`HWND(hwnd.0)`). Match `ShowWindow` / `SetWindowPos` call style to `src-tauri/src/input/cursor_highlight.rs`.

`id_object != 0` matches `OBJID_WINDOW` (0) plus `id_child == 0`, same filter as `focus_target::foreground_hook`.

Wire it at the end of `configure_main_window` in `src-tauri/src/window/mod.rs`:

```rust
    stay_visible::install(window);
```

- [ ] **Step 4: Run unit tests — expect PASS**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib stay_visible
```

Expected: four tests PASS (`main_window_config_…`, `restores_on_minimize`, `restores_on_hide`, `does_not_restore_on_other`).

- [ ] **Step 5: Add the ignored HWND integration test**

Append inside `#[cfg(test)] mod tests` in `stay_visible.rs`:

```rust
    #[cfg(windows)]
    #[ignore]
    #[test]
    fn minimize_is_restored_on_plain_hwnd() {
        use std::time::{Duration, Instant};
        use windows::core::w;
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, DispatchMessageW, IsIconic, PeekMessageW,
            RegisterClassW, ShowWindow, TranslateMessage, CS_HREDRAW, CS_VREDRAW,
            CW_USEDEFAULT, MSG, PM_REMOVE, SW_MINIMIZE, SW_SHOWNOACTIVATE, WNDCLASSW,
            WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
        };

        let class_name = w!("ReachPanelStayVisibleTest");
        let class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(windows::Win32::UI::WindowsAndMessaging::DefWindowProcW),
            lpszClassName: class_name,
            ..Default::default()
        };
        unsafe {
            let _ = RegisterClassW(&class);
        }
        let hwnd = unsafe {
            CreateWindowExW(
                WS_EX_TOPMOST,
                class_name,
                w!("stay-visible-test"),
                WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                320,
                200,
                None,
                None,
                None,
                None,
            )
        }
        .expect("CreateWindowExW");

        assert!(super::install_hooks_for_hwnd(hwnd));

        unsafe {
            let _ = ShowWindow(hwnd, SW_MINIMIZE);
        }

        let started = Instant::now();
        while started.elapsed() < Duration::from_millis(1000) {
            let mut msg = MSG::default();
            unsafe {
                while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
            if !unsafe { IsIconic(hwnd).as_bool() } {
                break;
            }
            std::thread::sleep(Duration::from_millis(16));
        }

        let iconic = unsafe { IsIconic(hwnd).as_bool() };
        super::uninstall();
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            let _ = DestroyWindow(hwnd);
        }
        assert!(!iconic, "window should be restored after SW_MINIMIZE");
    }
```

- [ ] **Step 6: Compile tests (ignored test must compile, not run in CI)**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib stay_visible -- --list
```

Confirm `minimize_is_restored_on_plain_hwnd` is listed as ignored. Then:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib stay_visible
```

On a desktop session, optionally run the ignored test; it should PASS. Headless CI must not run `--include-ignored`.

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib stay_visible
```

Expected: unit tests PASS; ignored test not run.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/window/stay_visible.rs src-tauri/src/window/mod.rs
git commit -m "fix(window): restore the panel if Windows hides or minimizes it"
```

---

### Task 3: Non-toggling `setCollapsed`

**Files:**
- Modify: `src/stores/types.ts` (`WindowSlice`)
- Modify: `src/stores/slices/windowSlice.ts`
- Create: `src/stores/slices/windowSlice.collapsed.test.ts`

**Interfaces:**
- Consumes: `waitForWindowAnimationIdle` from `src/stores/storeShared.ts`; existing collapse/expand body in `toggleCollapsed`
- Produces: `setCollapsed: (collapsed: boolean) => Promise<void>` on `WindowSlice`. `toggleCollapsed` is `() => get().setCollapsed(!get().settings.collapsed)`.

- [ ] **Step 1: Write the failing collapsed tests**

Create `src/stores/slices/windowSlice.collapsed.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS } from "../../lib/types";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((message: ArrayBuffer) => void) | null = null;
  },
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({
      label: "main",
      minimize: vi.fn(async () => {}),
      unminimize: vi.fn(async () => {}),
    }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

import { useAppStore } from "../appStore";

const invokeMock = vi.mocked(invoke);

function layoutInvokes() {
  return invokeMock.mock.calls.filter(
    ([cmd]) =>
      cmd === "cmd_apply_window_layout" || cmd === "cmd_animate_window_layout",
  );
}

describe("setCollapsed", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, collapsed: false },
      settingsEpoch: 1,
      profileHydrated: true,
      isAnimatingWindow: false,
      musicTeachingEnabled: false,
      focusModeActive: false,
      modeMenuOpen: false,
    });
  });

  it("setCollapsed(true) while already collapsed does not invoke layout IPC", async () => {
    useAppStore.setState({
      settings: { ...DEFAULT_SETTINGS, collapsed: true },
    });
    await useAppStore.getState().setCollapsed(true);
    expect(layoutInvokes()).toEqual([]);
    expect(useAppStore.getState().settings.collapsed).toBe(true);
  });

  it("toggleCollapsed still flips expanded to collapsed", async () => {
    await useAppStore.getState().toggleCollapsed();
    expect(useAppStore.getState().settings.collapsed).toBe(true);
    expect(layoutInvokes().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
npm test -- src/stores/slices/windowSlice.collapsed.test.ts
```

Expected: FAIL, `setCollapsed` is not a function.

- [ ] **Step 3: Extract `setCollapsed`**

In `src/stores/types.ts`, add to `WindowSlice` immediately after `toggleCollapsed`:

```ts
  setCollapsed: (collapsed: boolean) => Promise<void>;
```

In `src/stores/slices/windowSlice.ts`:

1. Import `waitForWindowAnimationIdle` from `../storeShared` (same import block as `persistSettingsIfCurrent`).
2. Replace `toggleCollapsed` with:

```ts
  setCollapsed: async (collapsed) => {
    await waitForWindowAnimationIdle(get);
    if (get().settings.collapsed === collapsed) {
      return;
    }
    set({ modeMenuOpen: false });
    const epoch = get().settingsEpoch;
    const { settings } = get();
    const next = { ...settings, collapsed };

    set({ isAnimatingWindow: true });
    try {
      if (collapsed) {
        if (get().settingsEpoch !== epoch) {
          return;
        }
        set({ settings: next });
        const persisted = await persistSettingsIfCurrent(get, epoch, next);
        if (!persisted) {
          return;
        }
        const collapseArgs = {
          monitorId: next.accessibilityMonitorId,
          collapsed: true,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(
            next,
            get().musicTeachingEnabled,
          ),
          fullWorkArea: teachingFullWorkAreaActive(
            next,
            get().musicTeachingEnabled,
          ),
        };
        const collapseCmd = prefersReducedMotion()
          ? "cmd_apply_window_layout"
          : "cmd_animate_window_layout";
        logLayoutIpc(collapseCmd, collapseArgs);
        await invoke(collapseCmd, collapseArgs);
      } else {
        const expandArgs = {
          monitorId: settings.accessibilityMonitorId,
          collapsed: false,
          collapsedDictation: false,
          heightRatio: heightRatioFromSettings(
            settings,
            get().musicTeachingEnabled,
          ),
          fullWorkArea: teachingFullWorkAreaActive(
            settings,
            get().musicTeachingEnabled,
          ),
        };
        const expandCmd = prefersReducedMotion()
          ? "cmd_apply_window_layout"
          : "cmd_animate_window_layout";
        logLayoutIpc(expandCmd, expandArgs);
        await invoke(expandCmd, expandArgs);
        if (get().settingsEpoch !== epoch) {
          return;
        }
        set({ settings: next });
        await persistSettingsIfCurrent(get, epoch, next);
      }
    } finally {
      set({ isAnimatingWindow: false });
      const queued = storeFlags.pendingFocusLayoutSync;
      storeFlags.pendingFocusLayoutSync = null;
      if (queued !== null && get().focusModeActive) {
        void syncFocusModeWindowLayout(get, set, queued);
      }
    }
  },
  toggleCollapsed: async () => {
    await get().setCollapsed(!get().settings.collapsed);
  },
```

Keep the collapse/expand persist order identical to the current `toggleCollapsed` (collapse: persist then layout; expand: layout then persist).

- [ ] **Step 4: Re-run tests — expect PASS**

```powershell
npm test -- src/stores/slices/windowSlice.collapsed.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/stores/types.ts src/stores/slices/windowSlice.ts src/stores/slices/windowSlice.collapsed.test.ts
git commit -m "feat(window): add setCollapsed so Companion can enter FAB without toggling"
```

---

### Task 4: Companion session enters and leaves FAB mode

**Files:**
- Modify: `src/stores/lib/restoreStack.ts` (`RestorePatch`)
- Modify: `src/stores/lib/restoreStack.test.ts`
- Modify: `src/stores/slices/companionSlice.ts`
- Modify: `src/stores/slices/modeSlice.ts`
- Modify: `src-tauri/src/companion/server.rs`
- Create: `src/stores/slices/companionSlice.test.ts`
- Modify: `src/stores/appStore.setAppMode.test.ts`

**Interfaces:**
- Consumes: Task 3 `setCollapsed(collapsed: boolean): Promise<void>`; `popRestore` already returns `RestorePatch | null`
- Produces:
  - `RestorePatch.collapsed?: boolean`
  - Session start: `pushRestore("companion", { mode?, collapsed }, { replace: true })` then `await setCollapsed(true)`
  - Session idle: keep the popped patch; `await setAppMode(mapped.restore, { skipCompanionBridgeStop: true })`; if `patch?.collapsed === false` then `await setCollapsed(false)`
  - `setAppMode("companion")` with live session: `await get().setCollapsed(true)` (no `WebviewWindow.minimize`)
  - Backend emit `{ phase: "active" }` / `{ phase: "idle" }` only

- [ ] **Step 1: Write failing frontend tests**

Add to `src/stores/lib/restoreStack.test.ts`:

```ts
  it("companion restore frames can record collapsed", () => {
    const next = pushRestoreEntry([], "companion", {
      mode: "normal",
      collapsed: false,
    });
    expect(peekRestore(next, "companion")).toEqual({
      mode: "normal",
      collapsed: false,
    });
  });
```

Create `src/stores/slices/companionSlice.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SETTINGS } from "../../lib/types";

const windowFns = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  unminimize: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage: ((message: ArrayBuffer) => void) | null = null;
  },
  invoke: vi.fn((cmd: string) => {
    if (cmd === "cmd_get_input_focused") return Promise.resolve(false);
    return Promise.resolve(undefined);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getCurrent: () => ({
      label: "main",
      minimize: windowFns.minimize,
      unminimize: windowFns.unminimize,
    }),
  },
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("../../lib/motion", () => ({
  MOTION: { fast: 120, base: 200, slow: 300, focusKeyboard: 250 },
  prefersReducedMotion: () => true,
  afterNextPaint: () => Promise.resolve(),
}));

import { useAppStore } from "../appStore";
import { peekRestore } from "../lib/restoreStack";

const invokeMock = vi.mocked(invoke);

describe("applyCompanionSessionPhase FAB", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    windowFns.minimize.mockClear();
    windowFns.unminimize.mockClear();
    useAppStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        collapsed: false,
        focusModeOverride: false,
        micMode: false,
        keyboardSectionMode: "keyboard",
      },
      settingsEpoch: 1,
      profileHydrated: true,
      musicTeachingEnabled: false,
      restoreStack: [],
      companionBridgeArmed: false,
      companionModeActive: false,
      companionSessionLive: false,
      focusModeActive: false,
      isAnimatingWindow: false,
      monitors: [],
    });
  });

  it("active records collapsed false and enters FAB", async () => {
    await useAppStore.getState().applyCompanionSessionPhase("active");
    const state = useAppStore.getState();
    expect(state.settings.collapsed).toBe(true);
    expect(state.companionSessionLive).toBe(true);
    expect(peekRestore(state.restoreStack, "companion")).toEqual({
      mode: "normal",
      collapsed: false,
    });
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });

  it("idle restores previous mode and expanded state", async () => {
    await useAppStore.getState().applyCompanionSessionPhase("active");
    await useAppStore.getState().applyCompanionSessionPhase("idle");
    const state = useAppStore.getState();
    expect(state.settings.collapsed).toBe(false);
    expect(state.companionSessionLive).toBe(false);
    expect(state.companionModeActive).toBe(false);
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });

  it("idle leaves FAB if it was already collapsed", async () => {
    useAppStore.setState({
      settings: { ...useAppStore.getState().settings, collapsed: true },
    });
    await useAppStore.getState().applyCompanionSessionPhase("active");
    await useAppStore.getState().applyCompanionSessionPhase("idle");
    expect(useAppStore.getState().settings.collapsed).toBe(true);
    expect(windowFns.minimize).not.toHaveBeenCalled();
  });
});
```

In `src/stores/appStore.setAppMode.test.ts`, replace the existing `webviewWindow` mock with the same `vi.hoisted` `windowFns` pattern as `companionSlice.test.ts`.

Add this test inside `describe("setAppMode")` in `appStore.setAppMode.test.ts`, and `mockClear` the spies in `beforeEach`:

```ts
  it("setAppMode('companion') with a live session enters FAB and never minimizes", async () => {
    windowFns.minimize.mockClear();
    windowFns.unminimize.mockClear();
    useAppStore.setState({
      companionSessionLive: true,
      companionModeActive: true,
      settings: { ...DEFAULT_SETTINGS, collapsed: false },
      settingsEpoch: 1,
      profileHydrated: true,
      isAnimatingWindow: false,
    });
    await useAppStore.getState().setAppMode("companion");
    expect(useAppStore.getState().settings.collapsed).toBe(true);
    expect(windowFns.minimize).not.toHaveBeenCalled();
    expect(windowFns.unminimize).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run frontend tests — expect FAIL**

```powershell
npm test -- src/stores/lib/restoreStack.test.ts src/stores/slices/companionSlice.test.ts src/stores/appStore.setAppMode.test.ts
```

Expected: `restoreStack` new test FAIL (`collapsed` not on patch type is OK in TS structural typing — the assertion still passes if we push it; this test may PASS early). `companionSlice` FAIL: session stays expanded / no collapsed on restore frame. `setAppMode` FAIL: `minimize` is called and/or `collapsed` stays false.

- [ ] **Step 3: Implement restore patch, companion slice, mode slice**

`src/stores/lib/restoreStack.ts` — add to `RestorePatch`:

```ts
  collapsed?: boolean;
```

`src/stores/slices/companionSlice.ts` live branch, replace the `if (captured != null) { pushRestore... }` plus flags with:

```ts
      get().pushRestore(
        "companion",
        {
          ...(captured != null ? { mode: captured } : {}),
          collapsed: current.settings.collapsed,
        },
        { replace: true },
      );
      set({
        companionSessionLive: true,
        companionModeActive: true,
        companionBridgeArmed: true,
      });
      await get().setCollapsed(true);
      return;
```

Idle branch:

```ts
    const patch = get().popRestore("companion");
    set({
      companionSessionLive: false,
      companionModeActive: false,
      companionBridgeArmed: true,
    });
    await get().setAppMode(mapped.restore, { skipCompanionBridgeStop: true });
    if (patch?.collapsed === false) {
      await get().setCollapsed(false);
    }
```

`src/stores/slices/modeSlice.ts` — replace the live-session `minimize()` call:

```ts
      case "companion": {
        await startCompanionBridge();
        set({ companionBridgeArmed: true });
        const afterStart = get();
        if (afterStart.companionModeActive || afterStart.companionSessionLive) {
          await get().setCollapsed(true);
        }
        return;
      }
```

Keep the `WebviewWindow` import; it is still used for `shouldDelegateAppModeToMain(WebviewWindow.getCurrent().label)`.

- [ ] **Step 4: Write failing backend source tests**

Append to `src-tauri/src/companion/server.rs`:

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn session_payload_is_phase_only() {
        assert_eq!(
            super::session_event_payload("active"),
            serde_json::json!({ "phase": "active" })
        );
        assert_eq!(
            super::session_event_payload("idle"),
            serde_json::json!({ "phase": "idle" })
        );
    }

    #[test]
    fn server_source_does_not_minimize_the_window() {
        let src = include_str!("server.rs");
        assert!(
            !src.contains(".minimize("),
            "companion server must not call window.minimize"
        );
        assert!(
            !src.contains(".unminimize("),
            "companion server must not call window.unminimize"
        );
    }
}
```

- [ ] **Step 5: Run backend tests — expect FAIL**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib server_source_does_not_minimize_the_window
```

Expected: compile FAIL (`session_event_payload` missing) and/or assertion FAIL on `.minimize(`.

- [ ] **Step 6: Remove backend minimize and emit phase only**

In `src-tauri/src/companion/server.rs`, add:

```rust
pub(crate) fn session_event_payload(phase: &'static str) -> serde_json::Value {
    serde_json::json!({ "phase": phase })
}
```

Replace `on_session_active` / `on_session_inactive` with:

```rust
pub fn on_session_active(app: &AppHandle) {
    let _ = app.emit("companion-session", session_event_payload("active"));
}

pub fn on_session_inactive(app: &AppHandle) {
    let _ = app.emit("companion-session", session_event_payload("idle"));
}
```

- [ ] **Step 7: Re-run tests — expect PASS**

```powershell
npm test -- src/stores/lib/restoreStack.test.ts src/stores/slices/companionSlice.test.ts src/stores/slices/windowSlice.collapsed.test.ts src/stores/appStore.setAppMode.test.ts
cargo test --manifest-path src-tauri/Cargo.toml --lib session_payload_is_phase_only
cargo test --manifest-path src-tauri/Cargo.toml --lib server_source_does_not_minimize_the_window
```

Expected: all PASS.

- [ ] **Step 8: Grep bar**

```powershell
rg "\.minimize\(|\.unminimize\(" src src-tauri/src --glob "!**/*test*"
```

Expected: no matches on the `main` window. Hits in Teaching keyboard / section `minimized` / i18n `minimizeSection` are unrelated and allowed. `WebviewWindow.minimize` must not appear in `modeSlice.ts` or `companion/server.rs`.

- [ ] **Step 9: Commit**

```powershell
git add src/stores/lib/restoreStack.ts src/stores/lib/restoreStack.test.ts src/stores/slices/companionSlice.ts src/stores/slices/companionSlice.test.ts src/stores/slices/modeSlice.ts src/stores/appStore.setAppMode.test.ts src-tauri/src/companion/server.rs
git commit -m "fix(companion): collapse to FAB on session start instead of minimizing"
```

---

### Task 5: README + CI bar

**Files:**
- Modify: `README.md` (companion install paragraph, currently line 25)

**Interfaces:**
- Consumes: Task 4 behaviour (FAB, not OS minimize)
- Produces: README sentence matches product behaviour

- [ ] **Step 1: Update the companion paragraph**

Replace:

```text
When a tablet connects, Companion becomes the selected mode and the host minimizes. Disconnect restores the previous mode and unminimizes but keeps the bridge running (reconnect without tapping Companion again).
```

with:

```text
When a tablet connects, Companion becomes the selected mode and the host switches to FAB mode (the collapsed floating button). Disconnect restores the previous mode and its collapsed or expanded state but keeps the bridge running (reconnect without tapping Companion again).
```

- [ ] **Step 2: Run the full local bar**

```powershell
npm run lint
npm run typecheck
npm test
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all pass. Ignored `minimize_is_restored_on_plain_hwnd` is not run.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: Companion sessions use FAB mode, not OS minimize"
```

---

## Manual checks (not a task; record in the PR)

Release build, dual extended monitors, panel on each monitor, Normal / Mini / Focus:

1. No ReachPanel taskbar button. Alt+Space Minimize does nothing.
2. Win+M: other windows minimize; panel stays.
3. Win+D twice: panel visible (or back within about one frame), same position/size, no focus steal. Logs show `stay_visible: restored after …` if a restore happened.
4. Settings window still minimizes.
5. Companion session → FAB; end session → previous mode and collapsed state.
6. Kill WebView2 renderer; after recovery, 1–3 still hold.
7. PR notes Alt+Tab behaviour without a taskbar button.
8. PR includes the grep from Task 4 Step 8.

Do not change `lib.rs`. Do not add a tray icon.
