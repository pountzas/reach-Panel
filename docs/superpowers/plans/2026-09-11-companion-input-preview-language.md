# Companion input preview + language switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream the host live input-field JPEG preview to the companion Keyboard tab (between suggestions and keys), and add a Lang control that lists/switches the host’s installed Windows keyboards.

**Architecture:** Keep the existing `input_preview` capture worker. When a companion session is live, push `input.preview.frame` / `input.preview.cleared` envelopes through a latest-wins outbound channel into the WebSocket write path instead of Tauri UI events. Add `keyboard.languages` / `keyboard.setLanguage` dispatch handlers that call `get_input_methods` / `set_input_method_by_hkl` and persist `typingLanguage`. Companion UI: `InputPreview` strip + Lang button/picker using `svg-flags` embedded SVG via `react-native-svg`.

**Tech Stack:** Rust (Tauri companion bridge), Expo React Native, `svg-flags`, `react-native-svg`, existing WebSocket JSON protocol v1.

## Global Constraints

- Windows-only host; no macOS/Linux stubs.
- Protocol stays v1 (additive message types only).
- Preview strip only on companion Keyboard tab.
- Language picker lists host Windows input methods only (no on-screen layout section this cut).
- Do not remap companion key glyph rows to the active layout this cut.
- Flags: same `svg-flags` dependency as desktop; RN renders via `getEmbeddedFlag` + `react-native-svg`.
- Companion Keyboard always receives preview when a focus target exists (ignore desktop `inputPreviewVisible` for companion routing).
- Latest-wins coalescing for preview frames (no multi-second JPEG backlog).
- Spec: `docs/superpowers/specs/2026-09-11-companion-input-preview-design.md`

---

## File map

| Path | Responsibility |
| --- | --- |
| `src-tauri/src/companion/outbound.rs` | Latest-wins preview event slot + subscribe API |
| `src-tauri/src/companion/outbound.rs` (tests) | Coalesce frame/clear behavior |
| `src-tauri/src/companion/mod.rs` | Expose push helpers; hold outbound on bridge/session |
| `src-tauri/src/companion/server.rs` | Register outbound on auth; `select!` outbound + WS read |
| `src-tauri/src/input/input_preview.rs` | Route frames to companion when session live |
| `src-tauri/src/companion/dispatch.rs` | `keyboard.languages` / `keyboard.setLanguage` |
| `companion/src/lib/flagCodeForLanguage.ts` | Country code map (desktop parity) |
| `companion/src/lib/flagCodeForLanguage.test.ts` | Unit tests (if companion has a test runner; else host-side or skip with note) |
| `companion/src/components/InputPreview.tsx` | Preview strip UI |
| `companion/src/components/CountryFlag.tsx` | RN flag from `svg-flags` embedded SVG |
| `companion/src/components/LanguagePickerModal.tsx` | Modal list of Windows methods |
| `companion/src/components/KeyboardPanel.tsx` | Lang key on bottom row |
| `companion/src/screens/ConnectedScreen.tsx` | Preview state + language wiring |
| `companion/package.json` | Add `svg-flags`, `react-native-svg` via `npx expo install` |

---

### Task 1: Outbound latest-wins slot (Rust)

**Files:**
- Create: `src-tauri/src/companion/outbound.rs`
- Modify: `src-tauri/src/companion/mod.rs` (add `mod outbound;`, re-export push helpers)
- Modify: `src-tauri/src/companion/session.rs` (hold `Arc<PreviewOutbound>` or attach to `CompanionBridge`)

**Interfaces:**
- Produces:
  - `enum PreviewPush { Frame { data_url: String, width: u32, height: u32 }, Cleared }`
  - `struct PreviewOutbound` with:
    - `fn push(&self, event: PreviewPush)` — overwrites pending; never blocks
    - `fn subscribe(&self) -> watch::Receiver<u64>` or `tokio::sync::watch::Receiver<Option<PreviewPush>>` — consumer reads latest
  - Prefer `tokio::sync::watch::channel(None)` storing `Option<PreviewPush>`; `push` sends `Some(event)` (clear = `Some(Cleared)`).
  - `CompanionBridge::preview_outbound() -> Arc<PreviewOutbound>`
  - `pub fn push_input_preview_frame(bridge, data_url, width, height)`
  - `pub fn push_input_preview_cleared(bridge)`

- [ ] **Step 1: Write failing unit tests in `outbound.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latest_frame_wins() {
        let out = PreviewOutbound::new();
        out.push(PreviewPush::Frame {
            data_url: "a".into(),
            width: 1,
            height: 1,
        });
        out.push(PreviewPush::Frame {
            data_url: "b".into(),
            width: 2,
            height: 2,
        });
        match out.latest() {
            Some(PreviewPush::Frame { data_url, width, height }) => {
                assert_eq!(data_url, "b");
                assert_eq!(width, 2);
                assert_eq!(height, 2);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn clear_replaces_frame() {
        let out = PreviewOutbound::new();
        out.push(PreviewPush::Frame {
            data_url: "a".into(),
            width: 1,
            height: 1,
        });
        out.push(PreviewPush::Cleared);
        assert!(matches!(out.latest(), Some(PreviewPush::Cleared)));
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

Run: `cargo test -p reachpanel --manifest-path src-tauri/Cargo.toml companion::outbound -- --nocapture`  
(Adjust package name if different — check `src-tauri/Cargo.toml` `[package].name`.)

- [ ] **Step 3: Implement `PreviewOutbound` + wire onto `CompanionBridge`**

```rust
// outbound.rs sketch
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

#[derive(Debug, Clone)]
pub enum PreviewPush {
    Frame { data_url: String, width: u32, height: u32 },
    Cleared,
}

pub struct PreviewOutbound {
    tx: watch::Sender<Option<PreviewPush>>,
    // keep Mutex only if tests need synchronous latest() without tokio
}

impl PreviewOutbound {
    pub fn new() -> Arc<Self> { /* watch::channel(None) */ }
    pub fn push(&self, event: PreviewPush) { let _ = self.tx.send(Some(event)); }
    pub fn subscribe(&self) -> watch::Receiver<Option<PreviewPush>> { self.tx.subscribe() }
    pub fn latest(&self) -> Option<PreviewPush> { self.tx.borrow().clone() }
}
```

Store `preview: Arc<PreviewOutbound>` on `CompanionBridge` (created in `new`).

- [ ] **Step 4: Re-run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/companion/outbound.rs src-tauri/src/companion/mod.rs src-tauri/src/companion/session.rs
git commit -m "$(cat <<'EOF'
Add companion preview outbound latest-wins channel.

EOF
)"
```

---

### Task 2: WebSocket select loop for outbound pushes

**Files:**
- Modify: `src-tauri/src/companion/server.rs`

**Interfaces:**
- Consumes: `Arc<PreviewOutbound>` from bridge (pass into `run_bridge` / `handle_connection`)
- Produces: authenticated connection forwards `PreviewPush` as:
  - `Envelope::event("input.preview.frame", json!({ "dataUrl", "width", "height" }))`
  - `Envelope::event("input.preview.cleared", json!({}))`

- [ ] **Step 1: Thread `preview: Arc<PreviewOutbound>` into `run_bridge` and `handle_connection`**

After successful `auth`, clone a `watch::Receiver` from `preview.subscribe()`.

- [ ] **Step 2: Replace the single `while let Some(msg) = read.next().await` loop with `tokio::select!`**

Structure:

```rust
let mut preview_rx = preview.subscribe();
// after auth only — or select with a gated flag
loop {
    tokio::select! {
        msg = read.next() => { /* existing inbound handling; break on None/close */ }
        changed = preview_rx.changed(), if authenticated => {
            if changed.is_err() { break; }
            let event = preview_rx.borrow_and_update().clone();
            if let Some(ev) = event {
                let env = match ev {
                    PreviewPush::Frame { data_url, width, height } => Envelope::event(
                        "input.preview.frame",
                        serde_json::json!({ "dataUrl": data_url, "width": width, "height": height }),
                    ),
                    PreviewPush::Cleared => Envelope::event(
                        "input.preview.cleared",
                        serde_json::json!({}),
                    ),
                };
                if send_json(&mut write, &env).await.is_err() { break; }
            }
        }
    }
}
```

On disconnect / session clear: leave outbound channel in place (next auth re-subscribes). Optionally `preview.push(Cleared)` on disconnect so stale tablets are not a concern (host has no tablet).

- [ ] **Step 3: Compile check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/companion/server.rs src-tauri/src/companion/mod.rs
git commit -m "$(cat <<'EOF'
Push input preview envelopes on the companion WebSocket.

EOF
)"
```

---

### Task 3: Route `input_preview` capture to companion when session live

**Files:**
- Modify: `src-tauri/src/input/input_preview.rs`

**Interfaces:**
- Consumes: `CompanionBridge::preview_outbound()` / `crate::companion::push_input_preview_*`
- Behavior change: when `companion_session_live()`, still capture; push to companion outbound instead of Tauri emit; when idle, keep existing Tauri emit path. Do **not** call `emit_cleared()` merely because companion is live.

- [ ] **Step 1: Change `preview_loop` branch**

Replace:

```rust
if companion_session_live() {
    emit_cleared();
    continue;
}
```

With routing inside success/clear paths:

```rust
let companion_live = companion_session_live();
// ... after has_input_target checks fail:
if companion_live {
    push_cleared_to_companion();
} else {
    emit_cleared();
}
// ... on successful capture:
if companion_live {
    push_frame_to_companion(data_url, width, height);
} else {
    // existing app.emit("input-preview-frame", ...)
}
```

Implement helpers that `try_state::<CompanionBridge>()` and call `preview.push(...)`.

- [ ] **Step 2: When companion becomes live, clear desktop UI once**

In `on_session_active` (already minimizes window) or first companion_live iteration: `emit_cleared()` for Tauri UI is fine once; do not skip capture.

- [ ] **Step 3: `cargo check`**

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/input/input_preview.rs
git commit -m "$(cat <<'EOF'
Route live input preview frames to the companion session.

EOF
)"
```

---

### Task 4: `keyboard.languages` / `keyboard.setLanguage` dispatch

**Files:**
- Modify: `src-tauri/src/companion/dispatch.rs`
- Modify: `src-tauri/src/input/keyboard.rs` only if a small helper is needed (prefer use existing `get_input_methods`, `set_input_method_by_hkl`, `get_keyboard_state`)

**Interfaces:**
- Produces replies per spec §5.2
- Persist: load profile `active` settings JSON, set `typingLanguage` to method `lang_tag`, `db.update_profile_settings`

- [ ] **Step 1: Add match arms**

```rust
"keyboard.languages" => {
    let methods = crate::input::get_input_methods();
    let state = crate::input::get_keyboard_state();
    let typing_language = /* from active profile settings typingLanguage, fallback state.system_language */;
    vec![Envelope::reply(id, "keyboard.languages.ok", serde_json::json!({
        "methods": methods,
        "activeHkl": state.system_hkl,
        "typingLanguage": typing_language,
    }))]
}
"keyboard.setLanguage" => {
    let hkl = env.payload.get("hkl").and_then(|v| v.as_u64());
    // Err bad_payload if missing
    // set_input_method_by_hkl(hkl)
    // find method in get_input_methods by hkl
    // merge typingLanguage into profile settings and update_profile_settings
    // reply keyboard.setLanguage.ok with hkl, langTag, layoutName, klid
}
```

Use `INTERNAL_PROFILE_ID` / `"active"` consistently with other companion handlers.

- [ ] **Step 2: Manual smoke via existing host or unit-test persist helper if easy**

If extracting `fn set_profile_typing_language(db, lang: &str) -> Result<()>` is cleaner, put it in `services/` and unit-test JSON merge.

- [ ] **Step 3: `cargo test` / `cargo check`**

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/companion/dispatch.rs src-tauri/src/services/*.rs
git commit -m "$(cat <<'EOF'
Add companion protocol handlers for Windows keyboard languages.

EOF
)"
```

---

### Task 5: Companion deps + flag helper + CountryFlag

**Files:**
- Modify: `companion/package.json` (via `npx expo install react-native-svg` and `npm install svg-flags@^1.0.6` in `companion/`)
- Create: `companion/src/lib/flagCodeForLanguage.ts`
- Create: `companion/src/components/CountryFlag.tsx`

**Interfaces:**
- Produces: `flagCodeForLanguage(langTag: string): string` — same map as `src/lib/keyboardLayouts.ts` (`en→gb`, `el→gr`, …)
- Produces: `languageDisplayCode(langTag: string): string`
- Produces: `<CountryFlag country={code} size={20} />` using `getEmbeddedFlag` from `svg-flags` + `SvgXml` from `react-native-svg`

- [ ] **Step 1: Install deps in `companion/`**

```bash
cd companion
npx expo install react-native-svg
npm install svg-flags@^1.0.6
```

- [ ] **Step 2: Add `flagCodeForLanguage.ts` with the desktop map copied verbatim**

- [ ] **Step 3: Implement `CountryFlag`**

```tsx
import { getEmbeddedFlag } from 'svg-flags';
import { SvgXml } from 'react-native-svg';

export function CountryFlag({ country, size = 20 }: { country: string; size?: number }) {
  const xml = getEmbeddedFlag(country);
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={Math.round(size * 0.75)} />;
}
```

If `getEmbeddedFlag` returns an object, adapt to the package’s actual return type (read `node_modules/svg-flags` types).

- [ ] **Step 4: Commit**

```bash
git add companion/package.json companion/package-lock.json companion/src/lib/flagCodeForLanguage.ts companion/src/components/CountryFlag.tsx
git commit -m "$(cat <<'EOF'
Add companion flag helper and svg-flags rendering for RN.

EOF
)"
```

---

### Task 6: `InputPreview` UI + ConnectedScreen wiring

**Files:**
- Create: `companion/src/components/InputPreview.tsx`
- Modify: `companion/src/screens/ConnectedScreen.tsx`

**Interfaces:**
- Consumes: `client.onMessage` for `input.preview.frame` / `input.preview.cleared`
- Layout when `tab === 'keyboard'`: SuggestionsBar → InputPreview → body KeyboardPanel

- [ ] **Step 1: Create `InputPreview`**

Props: `{ dataUrl: string | null }`. Height ~48, dark chrome, `Image` with `resizeMode="contain"` when url set, else “Waiting for preview…”. `accessibilityLabel="Target input"`.

- [ ] **Step 2: In `ConnectedScreen`, add state + subscription**

```tsx
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
useEffect(() => {
  return client.onMessage((env) => {
    if (env.type === 'input.preview.frame') {
      const url = typeof env.payload?.dataUrl === 'string' ? env.payload.dataUrl : null;
      setPreviewUrl(url);
    } else if (env.type === 'input.preview.cleared') {
      setPreviewUrl(null);
    }
  });
}, [client]);
// clear on disconnect:
useEffect(() => {
  if (status !== 'connected' && status !== 'reconnecting') setPreviewUrl(null);
}, [status]);
```

Render `{tab === 'keyboard' ? <InputPreview dataUrl={previewUrl} /> : null}` between suggestions and body.

- [ ] **Step 3: Commit**

```bash
git add companion/src/components/InputPreview.tsx companion/src/screens/ConnectedScreen.tsx
git commit -m "$(cat <<'EOF'
Show live host input preview on the companion keyboard tab.

EOF
)"
```

---

### Task 7: Language button + picker on KeyboardPanel

**Files:**
- Create: `companion/src/components/LanguagePickerModal.tsx`
- Modify: `companion/src/components/KeyboardPanel.tsx`
- Modify: `companion/src/screens/ConnectedScreen.tsx` (pass client, refresh snapshot, clear suggestions on lang change)
- Modify: `companion/src/types.ts` if adding `InputMethod` type

**Interfaces:**
- `KeyboardPanel` gains props: `client`, `typingLanguage`, `onLanguageChanged: (langTag: string) => void`
- Modal fetches `keyboard.languages` on open; selects via `keyboard.setLanguage`

- [ ] **Step 1: Add `InputMethod` type to `companion/src/types.ts`**

```ts
export type InputMethod = {
  hkl: number;
  langTag: string;
  displayName: string;
  layoutName: string;
  klid: string;
};
```

- [ ] **Step 2: Implement `LanguagePickerModal`**

- Visible boolean, `client`, `activeHkl`, `onClose`, `onPicked(method)`
- FlatList/ScrollView of methods with `CountryFlag` + names
- Loading / empty / error states

- [ ] **Step 3: Add Lang `KeyButton` on bottom row of `KeyboardPanel`**

Shows `CountryFlag` + `languageDisplayCode(typingLanguage)`. Opens modal. On pick: await setLanguage, call `onLanguageChanged`, close.

- [ ] **Step 4: Wire from `ConnectedScreen`**

Pass `language` from snapshot; on change clear prefix/suggestions and `refresh()` snapshot.

- [ ] **Step 5: Commit**

```bash
git add companion/src/components/LanguagePickerModal.tsx companion/src/components/KeyboardPanel.tsx companion/src/screens/ConnectedScreen.tsx companion/src/types.ts
git commit -m "$(cat <<'EOF'
Add companion keyboard language picker for Windows input methods.

EOF
)"
```

---

### Task 8: Spec status + README / companion design cross-link (if user-facing)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-companion-input-preview-design.md` (status already approved)
- Modify: `README.md` only if companion features are documented there — add one line about live preview + language switch on the tablet keyboard
- Optional: note new protocol types in `docs/superpowers/specs/2026-08-05-tablet-companion-design.md` §6

- [ ] **Step 1: Read README companion section; update if present**
- [ ] **Step 2: Commit docs if changed**

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Preview between suggestions and keys | Task 6 |
| Push `input.preview.frame` / `cleared` | Tasks 1–3 |
| Latest-wins coalesce | Task 1 |
| Capture while companion live; no desktop frames | Task 3 |
| `keyboard.languages` / `setLanguage` + persist typingLanguage | Task 4 |
| Lang UI + svg-flags on RN | Tasks 5, 7 |
| No layout picker / no key remapping | Explicit non-goals; not tasked |
| Ignore `inputPreviewVisible` for companion | Task 3 |

No TBD placeholders remain.

---

## Execution

User said **go** — proceed with **Subagent-Driven Development** per repo SDD model policy (`composer-2.5-fast` for mechanical tasks, `cursor-grok-4.5-high` for multi-file; parallel when disjoint).
