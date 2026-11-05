# Keep the panel window from ever being minimized — Design Spec

**Date:** 2026-11-05  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/370  
**Branch:** `fix/370-no-minimize` off `dev`; PR targets `dev`.  
**Scope:** The `main` panel window is never OS-minimized or hidden by user actions. Companion sessions enter FAB mode instead of minimizing. Windows only.

## 1. Goals

- Alt+Space Minimize, taskbar click, `minimize()` calls, Win+M, and Win+D cannot leave the panel hidden.
- Companion phone sessions collapse the panel to the FAB (`settings.collapsed: true`) and restore the previous mode plus collapsed/expanded state when the session ends.
- WebView2 recovery rebuilds of `main` keep the same no-minimize / no-taskbar settings.
- `settings` and `dictation-overlay` windows stay minimizable and closable as they are today.

## 2. Non-goals

- Tray icon or tray menu (follow-up; there will be no taskbar button).
- In-app section collapse or Teaching keyboard minimize.
- Close / quit behaviour, maximize (already disabled).
- Changing `settings` or `dictation-overlay`.
- Splitting or rewriting `lib.rs` (zero change; stop and ask if a line is actually required).
- macOS / Linux stubs or `#[cfg(not(target_os = "windows"))]` fallbacks.

## 3. Context (verified on this worktree)

- `src-tauri/tauri.conf.json` `main`: `maximizable: false`, `decorations: false`, `alwaysOnTop: true`. No `minimizable`, no `skipTaskbar`.
- `window::configure_main_window` (`src-tauri/src/window/mod.rs`) is the per-window setup used at boot and on WebView2 recovery. It does not call `set_minimizable` or `set_skip_taskbar`.
- Companion still OS-minimizes: `companion/server.rs` `on_session_active` / `on_session_inactive`, and `modeSlice.ts` `case "companion"` via `WebviewWindow.getCurrent().minimize()`.
- `applyCompanionSessionPhase` records mode on the restore stack but does not touch `settings.collapsed`. FAB is entered through `toggleCollapsed` (`windowSlice.ts`), which no-ops while `isAnimatingWindow` is true.
- `CompanionSessionEventPayload` already has only `phase`; the backend still sends unused `minimize: true|false`.
- `waitForWindowAnimationIdle` already exists in `storeShared.ts`.
- `dictation-overlay` already uses `skipTaskbar: true`.
- `windows` 0.58 with `Win32_UI_WindowsAndMessaging` and `Win32_UI_Accessibility`. `SetWinEventHook` is already used in `input/focus_target`.
- No tray icon is created.

## 4. Decisions

| Topic | Choice |
| --- | --- |
| Taskbar icon | Remove it (`skipTaskbar: true`). Do not subclass HWND to intercept `SC_MINIMIZE`. |
| Minimize style | `minimizable: false` in config + `set_minimizable(false)` on configure. |
| Win+D | Panel stays visible. Restore hook is a safety net, not the primary mechanism. |
| Companion | FAB mode, never OS minimize. Restore previous mode and collapsed state. |
| Restore flicker | Do not restore-on-minimize as the main strategy. |
| `lib.rs` | No change. |
| Persist FAB | `setCollapsed(true)` uses the same persist path as `toggleCollapsed`. A crash mid-session may restart in FAB; session-end restore writes the original collapsed flag back. |

## 5. Architecture

### 5.1 Window flags (`main` only)

`src-tauri/tauri.conf.json` `app.windows[label=main]`:

- `"minimizable": false`
- `"skipTaskbar": true`
- Keep existing `maximizable: false`, `alwaysOnTop: true`, `decorations: false`.

`configure_main_window`:

```text
set_decorations(false)
set_shadow(false)
set_always_on_top(true)
set_focusable(false)
set_minimizable(false)
set_skip_taskbar(true)
icon_sync::register_main_window_icon_sync(...)
exclude_window_from_capture(...)
stay_visible::install(...)
```

Tauri's skip-taskbar is the source of `WS_EX_TOOLWINDOW` (or equivalent). Do not set extended styles by hand unless a test-PC check proves Tauri did not.

### 5.2 Stay-visible safety net

New Windows-only module `src-tauri/src/window/stay_visible.rs`, `pub(crate)`, installed only from `configure_main_window`.

**Watch**

- Two `WINEVENT_OUTOFCONTEXT` hooks, same style as `focus_target`: `EVENT_SYSTEM_MINIMIZESTART` and `EVENT_OBJECT_HIDE` (Win+D may hide rather than minimize).
- Callback filter: `hwnd` equals the stored `main` HWND and `idObject == OBJID_WINDOW`, so child WebView hides do not restore.
- Backstop: Tauri `WindowEvent::Resized` plus `window.is_minimized() == Ok(true)`.

**Restore (no focus steal, no layout resize)**

- `ShowWindow(hwnd, SW_SHOWNOACTIVATE)`
- `SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE)`
- Do not call `cmd_apply_window_layout` / `cmd_animate_window_layout` from this path.
- Do not `set_focus` / `set_focusable(true)`.

**HWND lifetime**

- Store the HWND and hook handles. On WebView2 recovery, `configure_main_window` unhooks first, then installs on the new HWND. Do not restore a destroyed HWND.
- On `WindowEvent::Destroyed`, unhook and clear the stored HWND.

**Breadcrumb** (no typed text): `diagnostics::breadcrumbs` as in `window/events.rs`:

- `"stay_visible: restored after minimize"`
- `"stay_visible: restored after hide"`

**Pure decision**

```rust
enum VisibilityEvent { Minimize, Hide, Other }
fn should_restore(event: VisibilityEvent) -> bool
```

Minimize and Hide restore. There is no allow-minimize flag; nothing in the app minimizes `main` after this change.

### 5.3 Companion → FAB

**Backend (`companion/server.rs`)**

- `on_session_active`: emit `companion-session` `{ phase: "active" }` only. No `window.minimize()`.
- `on_session_inactive`: emit `{ phase: "idle" }` only. No `unminimize()` / `show()`.
- Drop `minimize` from the JSON payload.

**Frontend collapsed setter**

Extract `setCollapsed(collapsed: boolean): Promise<void>` from `toggleCollapsed`:

1. `await waitForWindowAnimationIdle(get)` so an in-flight layout is not dropped.
2. If `settings.collapsed === collapsed`, return (no animation, no persist).
3. Otherwise run the current collapse/expand body (persist + `cmd_animate_window_layout` / `cmd_apply_window_layout`).
4. `toggleCollapsed` becomes `setCollapsed(!get().settings.collapsed)`.

Add `setCollapsed` to `WindowSlice`. FAB click / ModeMenu keep calling `toggleCollapsed`.

**Restore stack**

Add optional `collapsed?: boolean` to `RestorePatch`. Companion is the only writer in this change.

**Session start (`applyCompanionSessionPhase` live)**

After capturing mode:

```text
pushRestore("companion", { mode: captured, collapsed: current.settings.collapsed }, { replace: true })
set companion flags
await setCollapsed(true)
```

If already live, keep the early return (no second collapse).

**Session end (idle, not ignored)**

```text
patch = popRestore("companion")
set companion flags idle
await setAppMode(mapped.restore, { skipCompanionBridgeStop: true })
if (patch?.collapsed === false) await setCollapsed(false)
```

If `patch.collapsed` is `true` or missing, leave collapsed as-is (`setCollapsed(true)` was a no-op when already FAB; missing means an older frame — do not force-expand).

**`setAppMode("companion")`**

Replace `WebviewWindow.getCurrent().minimize()` with `await get().setCollapsed(true)` under the same live-session condition (`companionModeActive || companionSessionLive`). Do not push a restore frame here; `applyCompanionSessionPhase` owns that when the session becomes live. Tapping Companion before a session still does not collapse.

**Grep bar**

No `minimize()` / `unminimize()` on the `main` window in `src-tauri/src` or `src/`. Teaching keyboard / section `minimized` flags are unrelated and stay.

## 6. Data flow

```text
Boot / WebView2 recovery
  → configure_main_window
      → minimizable false, skip taskbar
      → stay_visible::install(hwnd)

User Win+D / Win+M / stray minimize
  → should_restore(Minimize|Hide) == true
  → SW_SHOWNOACTIVATE + HWND_TOPMOST (NOMOVE|NOSIZE|NOACTIVATE)
  → breadcrumb

Tablet session active
  → backend emit companion-session phase=active
  → applyCompanionSessionPhase
      → pushRestore({ mode, collapsed })
      → setCollapsed(true)   // FAB, persisted

Tablet session idle
  → backend emit phase=idle
  → popRestore
  → setAppMode(previous)
  → setCollapsed(false) if it was expanded before
```

## 7. Error handling

- `set_minimizable` / `set_skip_taskbar` failures: `let _ =` like the other configure calls; stay-visible still installs.
- WinEvent hook install failure: log an error; window flags still apply.
- Restore `ShowWindow` / `SetWindowPos` failure: log; do not panic.
- `setCollapsed` persist failure: keep current `toggleCollapsed` behaviour (abort that attempt, clear `isAnimatingWindow` in `finally`).
- `waitForWindowAnimationIdle` timeout (4s): proceed anyway, same as UpdatePrompt.

## 8. Testing

TDD: write the failing tests first, then the code.

**Window config (Rust, parses `tauri.conf.json`)**

- `main` has `minimizable: false`, `skipTaskbar: true`, `maximizable: false`, `alwaysOnTop: true`.

**`stay_visible` unit tests**

- `should_restore(Minimize) == true`
- `should_restore(Hide) == true`
- `should_restore(Other) == false`

**Windows integration (`#[cfg(windows)]`, always `#[ignore]` so headless CI skips it)**

- Plain topmost HWND with the hook installed.
- `ShowWindow(SW_MINIMIZE)` → restored, `IsIconic` is false.
- Run locally on the test PC with `cargo test -- --ignored`.

**Companion / mode (vitest)**

- `applyCompanionSessionPhase("active")` sets `settings.collapsed: true` and records the previous collapsed flag.
- `"idle"` restores previous mode and collapsed state (from expanded and from already-collapsed).
- `setAppMode("companion")` with a live session calls `setCollapsed(true)` (FAB), not `WebviewWindow.minimize`.
- Mocked `WebviewWindow.minimize` / `unminimize` spies are never called in any mode.
- `toggleCollapsed` still flips; `setCollapsed(true)` while already collapsed does not invoke layout IPC.

**Backend**

- `on_session_active` / `on_session_inactive` still emit `companion-session` with the right `phase`.
- No `minimize` / `unminimize` in `companion/server.rs` (unit test or grep assertion).

**CI bar**

- `npm run lint`, `npm run typecheck`, `npm test`, `cargo clippy`, `cargo test`.

**Manual (release build, dual extended monitors; record in the PR)**

1. No taskbar button; Alt+Space Minimize does nothing. Repeat on both monitors, Normal / Mini / Focus.
2. Win+M: other windows minimize; panel stays.
3. Win+D twice: panel visible (or back within about one frame), same position/size, no focus steal.
4. Settings window still minimizes; panel unaffected.
5. Companion session → FAB; end session → previous mode and collapsed state.
6. Kill WebView2 renderer; after recovery, 1–3 still hold.
7. Logs show `stay_visible` breadcrumbs for Win+D and no errors.
8. PR includes grep showing no `main`-window `minimize()` / `unminimize()`.
9. PR notes Alt+Tab behaviour without a taskbar button.

## 9. README

One-sentence correction in the companion install section: a tablet session switches the host to FAB mode (collapsed floating button), not OS minimize. Disconnect restores the previous mode and collapsed/expanded state, and keeps the bridge running.

## 10. Out of scope reminders

- Tray icon.
- Teaching / section minimize.
- `lib.rs` split.
- Non-Windows.
