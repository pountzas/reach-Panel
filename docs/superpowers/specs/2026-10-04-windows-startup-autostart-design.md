# Windows startup: launch ReachPanel at sign-in — Design Spec

**Date:** 2026-10-04  
**Status:** Approved for implementation  
**Issue:** https://github.com/pountzas/reach-Panel/issues/174  
**Scope:** Default-on Windows autostart via Tauri Autostart plugin, with a Settings opt-out. App-wide only — never tied to keyboard profiles.

## 1. Goals

- Fresh installs and upgrades with no prior autostart preference launch ReachPanel at Windows sign-in.
- Settings → General exposes a clear toggle to opt out / opt back in.
- Toggle and OS Startup registration stay reconciled; external Task Manager changes win on next load.
- Autostart is an OS/session concern for the whole app, not a per-profile setting.

## 2. Non-goals

- macOS / Linux stubs, CI jobs, or plugins.
- Minimized / tray-only launch on autostart (v1 matches a normal manual launch).
- Per-profile or `AppSettings` / `settings_json` storage for this flag.
- Automatic cleanup of Startup entries on uninstall (document only).
- Fighting the updater beyond using the plugin’s registered installed binary path.

## 3. Context

- Existing Tauri plugins: opener, updater, process — registered in `src-tauri/src/lib.rs`, permitted in `capabilities/default.json`.
- Frontend plugin helpers already exist (e.g. `src/lib/updater.ts` + `localStorage` for skip-version).
- Settings → General already hosts app language and similar controls; `ToggleRow` is the established checkbox pattern.
- Profile data lives in SQLite / profile files (`settings_json`). Autostart must not read or write any of that.

## 4. Decision

**Approach 1 — frontend-owned:** `tauri-plugin-autostart` + `src/lib/autostart.ts` + global `localStorage` marker (not profiles) + Settings General `ToggleRow`.

**Persistence:** Global only — `localStorage` keys such as `autostartPreferenceKnown` and cached `autostartEnabled`. Never `AppSettings`, never profile switch paths.

**Reconcile policy:** OS wins. On load, if preference is already known, `isEnabled()` updates the cache and UI. Do not re-`enable()` solely because a stale cache said on.

**First run:** Missing known marker → `enable()`, set known + cache `true`. If `enable()` fails, leave known unset so the next launch retries default-on.

## 5. Architecture

### Native

- `tauri-plugin-autostart = "2"` in `src-tauri/Cargo.toml` (same major as other plugins).
- `.plugin(tauri_plugin_autostart::init(...))` in `lib.rs` using the Windows registration mode from current Tauri v2 Autostart docs (exact args deferred to the implementation plan).
- Capabilities (explicit): `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled`.
- Windows only; no `cfg` stubs for other OSes.

### Frontend module (`src/lib/autostart.ts`)

- Thin wrappers around `@tauri-apps/plugin-autostart` (`enable`, `disable`, `isEnabled`).
- `reconcileAutostartOnLoad(): Promise<boolean>` — first-run default-on or OS-wins sync.
- `setAutostartEnabled(on: boolean): Promise<void>` — plugin call + cache update; on failure, re-read OS and throw/surface error for UI.
- Pure storage helpers testable with mocked plugin + `localStorage`.

### UI

- Settings → `settingsGeneral`: `ToggleRow` labeled for “Start ReachPanel when Windows starts”, plus a short muted hint that turning off removes the app from Windows startup.
- Local component state (or equivalent) seeded by reconcile; not wired through `updateSettings` / profile store.
- i18n: label, hint, and accessible naming in all `src/i18n/*.ts` locales.

### Lifecycle

- Call `reconcileAutostartOnLoad()` once after the app can invoke Tauri (app bootstrap), so default-on applies even if Settings is never opened.
- Call reconcile again when Settings mounts so Task Manager Startup changes appear without requiring a full app restart.
- Autostart launch behavior: same as manual start (main window visible).

## 6. Data flow

```text
App boot
  → reconcileAutostartOnLoad()
      → if !preferenceKnown → enable() → known=true, cache=true
      → else → cache = isEnabled()   // OS wins; no force-enable

Settings toggle
  → setAutostartEnabled(on)
      → enable() | disable()
      → on success: cache = on
      → on failure: cache = isEnabled(); show toast; revert UI

Profile switch / updateSettings
  → no interaction
```

## 7. Error handling

- Boot reconcile failure: do not crash; do not set `preferenceKnown` on first-run `enable()` failure.
- Toggle failure: revert UI to OS state; short error toast.
- Non-Tauri / plain web dev: helpers no-op or return safe defaults so Settings does not throw.

## 8. Testing

**Vitest** (mocked plugin + `localStorage`):

- First run → `enable()`, known + cache true.
- Known + OS false → no `enable()`; cache false.
- Known + OS true → cache true; no `disable()`.
- `setAutostartEnabled` calls the matching plugin API and updates cache.
- Toggle/plugin throw → UI/cache target restored from `isEnabled()`; first-run known stays unset on enable failure.

**Manual / notes:**

- New install / upgrade without marker → listed under Windows Startup apps.
- Settings off removes entry; on restores it.
- Disable in Task Manager, relaunch → toggle off.
- Profile switch does not change Startup registration.
- Windows CI build with plugin + capabilities.

## 9. Acceptance mapping (issue #174)

| Criterion | Design coverage |
| --- | --- |
| Default launch at sign-in | First-run `enable()` when known marker missing |
| Settings disable / re-enable | General `ToggleRow` → `disable` / `enable` |
| Persist + match `isEnabled()` | Global `localStorage` + OS-wins reconcile |
| Plugin + capabilities + Windows CI | Native section |
| i18n | Label + hint (+ a11y name) in all locales |
| Upgrade default-on; disable before uninstall | First-run marker; uninstall note in non-goals |

## 10. Open points for implementation plan (not blockers)

- Exact Autostart `init` args for Windows (registry vs folder) — follow current Tauri v2 plugin docs at implement time.
- Exact bootstrap call site in `App.tsx` / store init — pick the earliest reliable post-Tauri point.
