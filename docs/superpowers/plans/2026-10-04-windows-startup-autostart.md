# Windows startup autostart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Default-on Windows sign-in autostart for ReachPanel via Tauri Autostart, with a Settings opt-out that stays reconciled to OS Startup state.

**Architecture:** Frontend-owned helper (`src/lib/autostart.ts`) wraps `@tauri-apps/plugin-autostart`, stores a global “preference known” marker in `localStorage` (never profiles / `AppSettings`), reconciles on main-app boot and when Settings mounts (OS wins), and drives a General-section toggle.

**Tech Stack:** Tauri 2, `tauri-plugin-autostart` / `@tauri-apps/plugin-autostart` v2, React 19, Vitest (jsdom), existing `ToggleRow` + `notify` + i18n.

## Global Constraints

- Windows-only product; do not add macOS/Linux stubs, CI jobs, or `cfg` branches for other OSes.
- Autostart must not read or write keyboard profiles, `AppSettings`, `settings_json`, or `updateSettings`.
- Fresh install / upgrade with no known marker: default **on** via `enable()`.
- After preference is known: OS `isEnabled()` wins on reconcile; do not force-`enable()` from a stale cache.
- v1 launch behavior matches normal manual start (no `--minimized` / tray-only).
- Spec: `docs/superpowers/specs/2026-10-04-windows-startup-autostart-design.md`
- Issue: https://github.com/pountzas/reach-Panel/issues/174

---

## File map

| Path | Responsibility |
| --- | --- |
| `src/lib/autostart.ts` | Plugin wrappers, `localStorage` keys, `reconcileAutostartOnLoad`, `setAutostartEnabled` |
| `src/lib/autostart.test.ts` | Vitest coverage with injectable API + `localStorage` |
| `package.json` / lockfile | Add `@tauri-apps/plugin-autostart` ^2 |
| `src-tauri/Cargo.toml` | Add `tauri-plugin-autostart = "2"` |
| `src-tauri/src/lib.rs` | Register `tauri_plugin_autostart::Builder::new().build()` |
| `src-tauri/capabilities/default.json` | Autostart permissions |
| `src/App.tsx` | Call `reconcileAutostartOnLoad()` once during main window init |
| `src/components/settings/SettingsPanel.tsx` | General toggle + hint; reconcile on mount; toggle handler |
| `src/i18n/en.ts` (+ `el`, `de`, `fr`, `it`, `es`, `pt`) | Label, hint, error strings |

---

### Task 1: Autostart helper + unit tests (TDD)

**Files:**
- Create: `src/lib/autostart.ts`
- Create: `src/lib/autostart.test.ts`

**Interfaces:**
- Consumes: none from the app yet (injectable plugin API for tests; default uses `@tauri-apps/plugin-autostart`).
- Produces:
  - `AUTOSTART_PREFERENCE_KNOWN_KEY = "autostartPreferenceKnown"`
  - `AUTOSTART_ENABLED_CACHE_KEY = "autostartEnabled"`
  - `type AutostartApi = { enable(): Promise<void>; disable(): Promise<void>; isEnabled(): Promise<boolean> }`
  - `isAutostartPreferenceKnown(storage?: Storage): boolean`
  - `getCachedAutostartEnabled(storage?: Storage): boolean`
  - `reconcileAutostartOnLoad(api?: AutostartApi, storage?: Storage): Promise<boolean>`
  - `setAutostartEnabled(on: boolean, api?: AutostartApi, storage?: Storage): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/autostart.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSTART_ENABLED_CACHE_KEY,
  AUTOSTART_PREFERENCE_KNOWN_KEY,
  reconcileAutostartOnLoad,
  setAutostartEnabled,
  type AutostartApi,
} from "./autostart";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
}

function mockApi(overrides: Partial<AutostartApi> = {}): AutostartApi {
  return {
    enable: vi.fn(async () => {}),
    disable: vi.fn(async () => {}),
    isEnabled: vi.fn(async () => false),
    ...overrides,
  };
}

describe("reconcileAutostartOnLoad", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("first run enables autostart and marks preference known", async () => {
    const api = mockApi();
    const on = await reconcileAutostartOnLoad(api, storage);
    expect(on).toBe(true);
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(api.disable).not.toHaveBeenCalled();
    expect(storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY)).toBe("1");
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("1");
  });

  it("does not mark known when first-run enable fails", async () => {
    const api = mockApi({
      enable: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    await expect(reconcileAutostartOnLoad(api, storage)).rejects.toThrow("denied");
    expect(storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY)).toBeNull();
  });

  it("when known, OS false wins without calling enable", async () => {
    storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
    storage.setItem(AUTOSTART_ENABLED_CACHE_KEY, "1");
    const api = mockApi({ isEnabled: vi.fn(async () => false) });
    const on = await reconcileAutostartOnLoad(api, storage);
    expect(on).toBe(false);
    expect(api.enable).not.toHaveBeenCalled();
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("0");
  });

  it("when known, OS true updates cache without disable", async () => {
    storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
    storage.setItem(AUTOSTART_ENABLED_CACHE_KEY, "0");
    const api = mockApi({ isEnabled: vi.fn(async () => true) });
    const on = await reconcileAutostartOnLoad(api, storage);
    expect(on).toBe(true);
    expect(api.disable).not.toHaveBeenCalled();
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("1");
  });
});

describe("setAutostartEnabled", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
  });

  it("enable path calls enable and caches true", async () => {
    const api = mockApi();
    await expect(setAutostartEnabled(true, api, storage)).resolves.toBe(true);
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("1");
    expect(storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY)).toBe("1");
  });

  it("disable path calls disable and caches false", async () => {
    const api = mockApi();
    await expect(setAutostartEnabled(false, api, storage)).resolves.toBe(false);
    expect(api.disable).toHaveBeenCalledTimes(1);
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("0");
  });

  it("on failure restores cache from isEnabled", async () => {
    const api = mockApi({
      enable: vi.fn(async () => {
        throw new Error("fail");
      }),
      isEnabled: vi.fn(async () => false),
    });
    await expect(setAutostartEnabled(true, api, storage)).rejects.toThrow("fail");
    expect(storage.getItem(AUTOSTART_ENABLED_CACHE_KEY)).toBe("0");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/autostart.test.ts`

Expected: FAIL (module `./autostart` not found or exports missing).

- [ ] **Step 3: Implement `src/lib/autostart.ts`**

```ts
import {
  disable as pluginDisable,
  enable as pluginEnable,
  isEnabled as pluginIsEnabled,
} from "@tauri-apps/plugin-autostart";

export const AUTOSTART_PREFERENCE_KNOWN_KEY = "autostartPreferenceKnown";
export const AUTOSTART_ENABLED_CACHE_KEY = "autostartEnabled";

export type AutostartApi = {
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  isEnabled: () => Promise<boolean>;
};

const defaultApi: AutostartApi = {
  enable: () => pluginEnable(),
  disable: () => pluginDisable(),
  isEnabled: () => pluginIsEnabled(),
};

function writeCache(storage: Storage, on: boolean): void {
  storage.setItem(AUTOSTART_PREFERENCE_KNOWN_KEY, "1");
  storage.setItem(AUTOSTART_ENABLED_CACHE_KEY, on ? "1" : "0");
}

export function isAutostartPreferenceKnown(
  storage: Storage = localStorage,
): boolean {
  return storage.getItem(AUTOSTART_PREFERENCE_KNOWN_KEY) === "1";
}

export function getCachedAutostartEnabled(
  storage: Storage = localStorage,
): boolean {
  return storage.getItem(AUTOSTART_ENABLED_CACHE_KEY) === "1";
}

/**
 * First run (unknown preference): enable() and mark known.
 * Known preference: mirror OS isEnabled() into cache (OS wins).
 */
export async function reconcileAutostartOnLoad(
  api: AutostartApi = defaultApi,
  storage: Storage = localStorage,
): Promise<boolean> {
  if (!isAutostartPreferenceKnown(storage)) {
    await api.enable();
    writeCache(storage, true);
    return true;
  }
  const on = await api.isEnabled();
  writeCache(storage, on);
  return on;
}

/** Enable/disable OS registration and update the global cache. */
export async function setAutostartEnabled(
  on: boolean,
  api: AutostartApi = defaultApi,
  storage: Storage = localStorage,
): Promise<boolean> {
  try {
    if (on) {
      await api.enable();
    } else {
      await api.disable();
    }
    writeCache(storage, on);
    return on;
  } catch (error) {
    try {
      const actual = await api.isEnabled();
      writeCache(storage, actual);
    } catch {
      // keep prior cache if OS read also fails
    }
    throw error;
  }
}
```

Note: `@tauri-apps/plugin-autostart` may not be installed yet. If TypeScript/Vitest cannot resolve it in this task, add the npm dependency first (Task 2 Step 1), then finish this task — do **not** stub macOS paths.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/autostart.test.ts`

Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/autostart.ts src/lib/autostart.test.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: add autostart helper with OS-wins reconcile

EOF
)"
```

---

### Task 2: Native plugin, npm package, capabilities

**Files:**
- Modify: `package.json` (and lockfile via npm)
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs` (plugin registration near opener/updater/process)
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: Tauri v2 Autostart plugin (`Builder::new().build()`; JS `enable` / `disable` / `isEnabled`).
- Produces: Plugin registered and callable from the webview with permissions.

- [ ] **Step 1: Add JS dependency**

Run: `npm add @tauri-apps/plugin-autostart`

Expected: `package.json` lists `"@tauri-apps/plugin-autostart": "^2..."` alongside other `@tauri-apps/plugin-*` entries.

- [ ] **Step 2: Add Rust dependency**

In `src-tauri/Cargo.toml`, next to the other plugins:

```toml
tauri-plugin-opener = "2"
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
tauri-plugin-autostart = "2"
```

- [ ] **Step 3: Register the plugin**

In `src-tauri/src/lib.rs`, in `run()`, extend the builder chain:

```rust
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
```

Do **not** pass macOS launcher enums or add `cfg(target_os = ...)` stubs. No extra CLI args for v1 (normal launch).

- [ ] **Step 4: Capabilities**

In `src-tauri/capabilities/default.json`, add after the process permission (explicit allows per spec):

```json
    "updater:default",
    "process:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled"
```

- [ ] **Step 5: Verify Rust project resolves the plugin**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: succeeds (or only pre-existing unrelated warnings). If `Builder` API differs on the resolved crate version, follow that crate’s docs — still Windows-only, still no OS stubs.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "$(cat <<'EOF'
feat: register Tauri autostart plugin on Windows

EOF
)"
```

---

### Task 3: Reconcile on main app boot

**Files:**
- Modify: `src/App.tsx` (main window `useEffect` init around the existing `loadProfileFiles` / `checkForUpdates` path)

**Interfaces:**
- Consumes: `reconcileAutostartOnLoad()` from `./lib/autostart`
- Produces: first-run default-on even if Settings is never opened; failures must not block the rest of init

- [ ] **Step 1: Import helper**

Near other `src/lib` imports in `src/App.tsx`:

```ts
import { reconcileAutostartOnLoad } from "./lib/autostart";
```

- [ ] **Step 2: Call reconcile during main init (non-blocking for other setup)**

Inside the main window `init` async function in `App.tsx`, after core setup that already runs (e.g. near `void checkForUpdates();`), add:

```ts
        void reconcileAutostartOnLoad().catch((error) => {
          console.warn("autostart reconcile failed", error);
        });
```

Do **not** put this inside profile load/save helpers. Do **not** call it from `ToolApp` profile init except via Settings mount (Task 4). Autostart stays app-global.

- [ ] **Step 3: Typecheck / unit tests still pass**

Run: `npm test -- src/lib/autostart.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
feat: reconcile Windows autostart on app boot

EOF
)"
```

---

### Task 4: Settings General toggle + i18n

**Files:**
- Modify: `src/components/settings/SettingsPanel.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/el.ts`
- Modify: `src/i18n/de.ts`
- Modify: `src/i18n/fr.ts`
- Modify: `src/i18n/it.ts`
- Modify: `src/i18n/es.ts`
- Modify: `src/i18n/pt.ts`

**Interfaces:**
- Consumes:
  - `reconcileAutostartOnLoad(): Promise<boolean>`
  - `setAutostartEnabled(on: boolean): Promise<boolean>`
  - `getCachedAutostartEnabled(): boolean`
  - `notify.error(message: string)` from `../../lib/notify`
  - `t("launchAtWindowsSignIn" | "launchAtWindowsSignInHint" | "launchAtWindowsSignInError")`
- Produces: Settings UI only; no store/profile fields

- [ ] **Step 1: Add English keys**

In `src/i18n/en.ts`, next to `appLanguageHint`:

```ts
  launchAtWindowsSignIn: "Start ReachPanel when Windows starts",

  launchAtWindowsSignInHint: "Turn off to remove ReachPanel from Windows startup",

  launchAtWindowsSignInError: "Could not update Windows startup",
```

- [ ] **Step 2: Add the same keys to every locale**

`el.ts`:

```ts
  launchAtWindowsSignIn: "Εκκίνηση του ReachPanel με την είσοδο στα Windows",
  launchAtWindowsSignInHint: "Απενεργοποιήστε για αφαίρεση από την εκκίνηση των Windows",
  launchAtWindowsSignInError: "Δεν ήταν δυνατή η ενημέρωση της εκκίνησης των Windows",
```

`de.ts`:

```ts
  launchAtWindowsSignIn: "ReachPanel beim Windows-Anmelden starten",
  launchAtWindowsSignInHint: "Deaktivieren entfernt ReachPanel aus dem Windows-Autostart",
  launchAtWindowsSignInError: "Windows-Autostart konnte nicht aktualisiert werden",
```

`fr.ts`:

```ts
  launchAtWindowsSignIn: "Démarrer ReachPanel à la connexion Windows",
  launchAtWindowsSignInHint: "Désactiver retire ReachPanel du démarrage Windows",
  launchAtWindowsSignInError: "Impossible de mettre à jour le démarrage Windows",
```

`it.ts`:

```ts
  launchAtWindowsSignIn: "Avvia ReachPanel all'accesso di Windows",
  launchAtWindowsSignInHint: "Disattivare rimuove ReachPanel dall'avvio di Windows",
  launchAtWindowsSignInError: "Impossibile aggiornare l'avvio di Windows",
```

`es.ts`:

```ts
  launchAtWindowsSignIn: "Iniciar ReachPanel al iniciar sesión en Windows",
  launchAtWindowsSignInHint: "Desactivar quita ReachPanel del inicio de Windows",
  launchAtWindowsSignInError: "No se pudo actualizar el inicio de Windows",
```

`pt.ts`:

```ts
  launchAtWindowsSignIn: "Iniciar o ReachPanel no início de sessão do Windows",
  launchAtWindowsSignInHint: "Desativar remove o ReachPanel do arranque do Windows",
  launchAtWindowsSignInError: "Não foi possível atualizar o arranque do Windows",
```

- [ ] **Step 3: Wire SettingsPanel state (local only)**

In `SettingsPanel.tsx` imports:

```ts
import {
  getCachedAutostartEnabled,
  reconcileAutostartOnLoad,
  setAutostartEnabled,
} from "../../lib/autostart";
import { notify } from "../../lib/notify";
```

Inside `SettingsPanel`, after existing local state:

```ts
  const [launchAtSignIn, setLaunchAtSignIn] = useState<boolean>(() =>
    getCachedAutostartEnabled(),
  );
  const [launchAtSignInBusy, setLaunchAtSignInBusy] = useState(false);
```

Add mount reconcile (separate `useEffect`, not tied to profiles):

```ts
  useEffect((): void => {
    let cancelled = false;
    void reconcileAutostartOnLoad()
      .then((on) => {
        if (!cancelled) setLaunchAtSignIn(on);
      })
      .catch(() => {
        /* boot path already logs; keep cached UI */
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 4: Add toggle UI in General section**

Inside the `settingsGeneral` `SettingsSection`, **above** the app language control, add:

```tsx
            <div className="mb-3">
              <ToggleRow
                label={t("launchAtWindowsSignIn")}
                checked={launchAtSignIn}
                disabled={launchAtSignInBusy}
                onChange={(checked) => {
                  setLaunchAtSignInBusy(true);
                  setLaunchAtSignIn(checked);
                  void setAutostartEnabled(checked)
                    .then((on) => setLaunchAtSignIn(on))
                    .catch(() => {
                      setLaunchAtSignIn(getCachedAutostartEnabled());
                      notify.error(t("launchAtWindowsSignInError"));
                    })
                    .finally(() => setLaunchAtSignInBusy(false));
                }}
                surface={surface}
              />
              <span
                className="mt-1 block px-3 text-xs"
                style={{ color: surface.panelMutedText }}
              >
                {t("launchAtWindowsSignInHint")}
              </span>
            </div>
```

Do **not** call `updateSettings`. Do **not** add fields to `AppSettings` in `src/lib/types.ts`.

- [ ] **Step 5: Verify TypeScript + unit tests**

Run:

```bash
npm test -- src/lib/autostart.test.ts
npx tsc --noEmit
```

Expected: tests PASS; `tsc` clean (all locales have the new keys).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/SettingsPanel.tsx src/i18n/en.ts src/i18n/el.ts src/i18n/de.ts src/i18n/fr.ts src/i18n/it.ts src/i18n/es.ts src/i18n/pt.ts
git commit -m "$(cat <<'EOF'
feat: Settings toggle for Windows launch at sign-in

EOF
)"
```

---

### Task 5: Manual verification checklist (no code)

**Files:** none (operator checklist)

- [ ] **Step 1: Dev/build smoke**

Run a Windows Tauri build or `npm run tauri dev` and confirm the app starts with the plugin loaded (no capability/permission errors in the webview console when toggling).

- [ ] **Step 2: Acceptance checks**

- Fresh data (clear `localStorage` keys `autostartPreferenceKnown` / `autostartEnabled`, or new app data): after launch, ReachPanel appears under Windows **Settings → Apps → Startup** (or Task Manager → Startup apps).
- Settings → General → turn **off** → entry removed / disabled; turn **on** → restored.
- Disable in Task Manager, reopen Settings (or relaunch app) → toggle shows off.
- Switch keyboard profiles → Startup registration unchanged.
- Toggle failures (if injectable) show `launchAtWindowsSignInError` toast and revert UI.

- [ ] **Step 3: Final commit only if Task 5 found fixups**

If smoke testing required code fixes, commit those separately with a focused message. Otherwise no commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Plugin + capabilities + Windows-only | Task 2 |
| `autostart.ts` + global `localStorage` | Task 1 |
| First-run default on | Task 1 + Task 3 |
| OS wins reconcile | Task 1 |
| Boot reconcile | Task 3 |
| Settings mount reconcile | Task 4 |
| General toggle + hint + i18n | Task 4 |
| No profile / `AppSettings` coupling | Tasks 1–4 (explicit non-touch) |
| Error handling / toast | Task 1 failure paths + Task 4 |
| Unit tests | Task 1 |
| Manual acceptance | Task 5 |
| Normal launch (no minimized args) | Task 2 (empty Builder args) |
