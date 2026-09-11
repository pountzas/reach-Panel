# Companion keyboard live preview + language switch — Design Spec

**Date:** 2026-09-11  
**Status:** Approved for implementation  
**Scope:** Stream the host’s live focused-field preview to the Android companion keyboard tab, and add a Windows keyboard-language control mirroring the desktop Lang key

## 1. Goals

- On the companion **Keyboard** tab, show the same live target-field strip the desktop keyboard uses (BitBlt JPEG of the focused Windows input).
- Place it **between** the suggestions bar and the key grid.
- Add a language button that lists the **host’s installed Windows keyboards** and switches that system input method (same behavior as desktop `selectTypingInputMethod`).
- Keep transport on the existing local WebSocket JSON protocol (no WAN, no screen mirror).

## 2. Non-goals

- Companion settings toggle for preview (always show on Keyboard tab for this cut)
- Binary WebSocket frames for JPEG (JSON `dataUrl` is enough on LAN)
- Preview on Trackpad / Numpad / Dictation / Profile / USB tabs
- Changing desktop preview UX when companion is **not** connected
- Showing the desktop React preview strip while the companion session owns the tablet (host window stays minimized)
- On-screen layout picker section from the desktop LanguagePicker (QWERTY/QWERTZ/auto) — **out of this cut**; languages only
- Remapping companion key glyph rows to the active Windows layout (companion still sends `text.type` / `key.press` as today; layout-aware labels can follow later)

## 3. Context

Desktop already captures via `src-tauri/src/input/input_preview.rs` (~125 ms, JPEG quality 72, max ~640×120) and emits Tauri events `input-preview-frame` / `input-preview-cleared`.

Today, when a companion session is active (`tablet_audio_active`), that loop **clears** and skips capture so the minimized desktop UI does not keep updating. The tablet never receives frames.

The companion bridge is mostly request/reply on one WebSocket read loop. Host→tablet pushes already exist as envelopes with no client `id` (e.g. `session.state`). There is no shared outbound sink yet for background workers (preview thread) to push into the live socket.

## 4. Decision

**Reuse the existing capture pipeline and push frames to the companion over WebSocket.**  
**Reuse host `get_input_methods` / `set_input_method_by_hkl` for language switching; persist `typingLanguage` like the desktop Lang key.**

| Topic | Choice |
| --- | --- |
| Capture | Same `input_preview` worker (bounds from focus target, JPEG data URL) |
| Desktop during session | No desktop UI frames (window minimized); capture continues for companion |
| Transport | JSON text envelopes on the existing companion WebSocket |
| Cadence / size | Keep current interval and encode settings |
| UI placement | Keyboard tab only: Suggestions → Preview → Keys (+ Lang control on keyboard) |
| Empty preview | “Waiting for preview…” when cleared / no focused input target |
| Language list | Host installed Windows input methods only |
| Language switch | Activate HKL on Windows + persist profile `typingLanguage` |
| Flags | `svg-flags` embedded SVG via `react-native-svg` |

## 5. Protocol additions (v1, additive)

### 5.1 Input preview (server push)

Server-pushed events (no client `id`):

| Type | Direction | Payload |
| --- | --- | --- |
| `input.preview.frame` | S→C | `{ "dataUrl": "data:image/jpeg;base64,…", "width": number, "height": number }` |
| `input.preview.cleared` | S→C | `{}` |

Rules:

- Only send while an authenticated companion session is **Active** or **Reconnecting** (same lifetime as today’s session helpers).
- Drop frames if no live outbound sink (no connected tablet).
- Prefer dropping older pending frames over queuing (latest wins) so Wi‑Fi blips do not backlog multi-second JPEG queues.
- Protocol version stays `1` (additive event types; tablet ignores unknown types today).

### 5.2 Windows keyboard language (request / reply)

Mirror desktop `cmd_get_input_methods` / `cmd_set_input_method` (+ persist `typingLanguage`):

| Type | Direction | Purpose |
| --- | --- | --- |
| `keyboard.languages` | C→S | List installed Windows input methods |
| `keyboard.languages.ok` | S→C | `{ "methods": InputMethod[], "activeHkl": number, "typingLanguage": string }` |
| `keyboard.setLanguage` | C→S | `{ "hkl": number }` (required); optional `langTag` for sanity checks |
| `keyboard.setLanguage.ok` | S→C | `{ "hkl": number, "langTag": string, "layoutName": string, "klid": string }` |
| `keyboard.languageChanged` | S→C | Optional push if host language changes elsewhere (nice-to-have; not required for v1 if picker always re-fetches) |

`InputMethod` shape matches host serde (`camelCase`):

```json
{
  "hkl": 123456,
  "langTag": "el",
  "displayName": "Greek",
  "layoutName": "Greek",
  "klid": "00000408"
}
```

Host handler for `keyboard.setLanguage`:

1. `set_input_method_by_hkl(hkl)` (same as `cmd_set_input_method`).
2. Update active profile settings `typingLanguage` to the method’s `langTag` and persist (same as desktop store after a successful switch).
3. Reply `keyboard.setLanguage.ok` with the selected method fields.

## 6. Host architecture

```text
input_preview worker
        │
        ├─ companion session idle → emit Tauri `input-preview-frame` / cleared (unchanged)
        │
        └─ companion session live → push Envelope via CompanionBridge outbound sink
                                      → WebSocket write task → tablet
```

### 6.1 Outbound sink

Add a session-scoped outbound channel on the companion bridge (e.g. `tokio::sync::mpsc` or `watch` of latest frame + clear signal):

- Register the sink when the WebSocket finishes auth.
- Connection handler selects on inbound WS messages **and** outbound preview envelopes.
- Clear / unregister the sink on disconnect / revoke.
- Latest-frame coalescing: if the channel is full or a watch slot is overwritten, keep only the newest frame (or a clear).

### 6.2 `input_preview.rs` change

Replace “if companion live → emit_cleared and continue” with:

- If companion live → capture as usual; call `companion::push_input_preview_frame(...)` / `push_input_preview_cleared()` instead of Tauri UI emit.
- If companion idle → existing Tauri emit path.

Do not require the desktop setting `inputPreviewVisible` to gate companion frames. Companion Keyboard always wants the strip when a focus target exists. (Optional later: gate on that setting; out of scope now.)

### 6.3 Focus / bounds

No new focus logic. Keep using `get_input_target_bounds` / `has_input_target` / `notify_bounds_changed`.

## 7. Companion UI

### 7.1 Layout (`ConnectedScreen`)

When `tab === 'keyboard'`:

1. `SuggestionsBar` (existing)
2. New `InputPreview` strip
3. `KeyboardPanel` in the body (includes language control; see §7.4)

Preview mounts for the keyboard tab even if predictions are off (still useful while typing).

### 7.2 `InputPreview` component

- Fixed height strip (~48 dp), full width, dark chrome matching companion (`#121820` / `#1a2230` / border `#2a3140`).
- If `dataUrl` present: `Image` with `resizeMode="contain"`.
- Else: muted placeholder text “Waiting for preview…”.
- `accessibilityLabel`: “Target input”.

### 7.3 Preview state wiring

- `ConnectedScreen` (or a tiny hook) subscribes to `client.onMessage`.
- On `input.preview.frame`: store `{ dataUrl, width, height }`.
- On `input.preview.cleared` or disconnect: clear local frame.
- Leaving the keyboard tab only hides the strip; keep the last frame so returning to Keyboard is instant until the next host clear/frame.
- No need to request frames; host pushes.

### 7.4 Language button + picker

**Placement:** On the keyboard bottom row (with Space / ⌫ / Enter), or a compact control beside that row — same role as the desktop Lang key. Prefer a dedicated key-sized control labeled with flag + short code (e.g. `EN`), opening a modal/sheet list.

**Behavior:**

1. On open (and on Keyboard tab focus while connected): `keyboard.languages` → populate list.
2. Show each method with flag + `displayName` + `layoutName` + `langTag` code (mirror desktop LanguagePicker language section only).
3. Tap method → `keyboard.setLanguage` with `hkl` → on ok, update local `typingLanguage` / active HKL, close picker, refresh profile snapshot language used for predictions.
4. Empty list → “No keyboard languages found” (host has none / call failed).

**Flags (`svg-flags`):** Same npm dependency as the desktop app. The web `<Flag />` component is DOM-only; on React Native use `getEmbeddedFlag(country)` (or equivalent) from `svg-flags` and render via `react-native-svg` (`SvgXml`). Share the same `flagCodeForLanguage` mapping as `src/lib/keyboardLayouts.ts` (copy a small helper into `companion/src/` — do not import the whole desktop layout module).

**After switch:** Clear companion prediction prefix / suggestions (desktop clears typed buffer when language changes). Dictation already uses snapshot language; next dictation start picks up the new tag after snapshot refresh.

## 8. Failure modes

| Case | Behavior |
| --- | --- |
| No focused editable on Windows | Host sends `input.preview.cleared`; tablet shows waiting copy |
| Capture error | Log on host; leave last frame or clear (prefer clear after repeated failure — match desktop spirit) |
| Tablet on another tab | Host may still push; tablet may keep last frame in state but not render it |
| Reconnect | Sink re-registers after auth; first frames arrive after next capture tick |
| Large JPEG on slow Wi‑Fi | Latest-wins coalescing; acceptable brief stutter |
| Language list fails | Show error / empty copy; keep last known language on button |
| `setLanguage` fails | Keep picker open; show host error message; do not update local tag |
| No input target for language switch | Host returns same error path as desktop `cmd_set_input_method` |

## 9. Testing

- Unit: outbound coalescing helper (latest frame wins; clear beats stale frame).
- Unit: `flagCodeForLanguage` companion helper matches desktop mapping for `en`/`el`/`de`/….
- Manual preview: pair tablet → focus Notepad on PC → type on companion keyboard → strip updates between suggestions and keys; Alt-Tab away → waiting state; disconnect → desktop preview returns when host window restored and setting enabled.
- Manual language: open Lang on companion → list matches Windows installed keyboards → select Greek → Windows language bar / target app accepts Greek; companion predictions use `el`; select English back.

## 10. Files (expected)

| Area | Files |
| --- | --- |
| Host preview | `src-tauri/src/input/input_preview.rs` |
| Host bridge | `src-tauri/src/companion/mod.rs`, `session.rs` and/or `server.rs` (outbound sink); `dispatch.rs` for language messages |
| Host settings persist | shared path used by desktop after language switch (profile settings `typingLanguage`) |
| Protocol docs | this spec; optional note in tablet companion design §6 |
| Companion UI | `companion/src/components/InputPreview.tsx`, `LanguageButton` / picker, `ConnectedScreen.tsx`, `KeyboardPanel.tsx` |
| Companion deps | `svg-flags`, `react-native-svg` (Expo-compatible) |

## 11. Open questions

None blocking. Follow-ups (not this cut): companion toggle synced from `inputPreviewVisible`, binary frames if LAN profiling shows need, on-screen layout section, layout-aware companion key labels.
