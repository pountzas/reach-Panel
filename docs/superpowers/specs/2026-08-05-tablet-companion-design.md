# ReachPanel Tablet Companion — Design Spec

**Date:** 2026-08-05  
**Status:** Approved for implementation  
**Scope:** Android tablet companion (Wi‑Fi first) driving the Windows ReachPanel host over a local bridge

## 1. Goals

- A child completes a full writing assignment using **only** the tablet after a caregiver morning pair.
- Tablet is the active control surface; Windows UI **minimizes** while a companion session is active.
- Mobile-optimized native UI (not screen mirror, not WebView reuse of the desktop React shell).
- Local-only, offline, no cloud accounts. Groq/API keys stay on the host forever.

## 2. Non-goals (this product cut)

- Macros UI or macro execution from the tablet
- Head-tracking controls on the tablet
- Screen mirroring / remote desktop
- WAN / internet relay
- iOS as a first deliverable (TestFlight is last)

## 3. Decisions (locked)


| Topic | Choice |
| --- | --- |
| Role | Tablet replaces active control surface; host window minimizes on connect |
| UI | React Native / Expo (dev client), tablet form factor only |
| Platforms | Android first (Play + sideload APK); iOS last (TestFlight) |
| Transport | Wi‑Fi + QR pairing; USB = IP tethering + **same** protocol |
| Security | Local-only + one-time pairing token; durable device credential for reconnect |
| Latency | ~100 ms OK; survive brief Wi‑Fi drops with reconnect UX |
| Audio while connected | Tablet mic + tablet TTS; disable laptop mic/TTS for those companion paths |
| Injection | **Only** Windows host injects via `SendInput` (`src-tauri/src/input/`) |

## 4. Architecture

```text
┌────────────────────────────┐         ┌──────────────────────────────────┐
│  companion/ (Expo RN)      │  Wi‑Fi  │  ReachPanel (Tauri / Windows)    │
│  tablet UI, mic, TTS       │◄───────►│  companion bridge (Rust)         │
│  QR pair + reconnect       │  USB IP │  → input:: / db / prediction/STT │
└────────────────────────────┘         │  → minimize + tray status        │
                                       └──────────────────────────────────┘
```

**Hard rules**

1. Tablet never talks to target apps; host injects only.
2. Protocol is versioned JSON over one WebSocket (binary frames later only if needed).
3. Secrets (Groq keys, host TTS credentials) never sync to the tablet.
4. Prefer thin shared service functions so Tauri IPC commands and companion handlers call the same logic.

### Repo layout

| Path | Role |
| --- | --- |
| `src-tauri/src/companion/` | Bridge: listen, pairing, auth, session, protocol dispatch |
| `src-tauri/src/services/` | Shared host-side operations extracted from command bodies |
| `companion/` | Expo React Native tablet app |
| Desktop Settings → Companion | QR, paired devices, revoke, start/stop (UI follow-up) |

## 5. Host bridge

### 5.1 Listen & bind

- Default port: `17890` (configurable).
- Bind to `0.0.0.0` on the host for LAN/USB interfaces, but **refuse** intentional WAN exposure (no public relay; caregivers stay on local/USB subnet).
- Prefer advertising the primary non-loopback IPv4 in the QR payload.
- Start/stop controlled from host (auto-start optional later).

### 5.2 Pairing (QR)

QR / deep-link payload (JSON):

```json
{
  "hostId": "<stable host uuid>",
  "ip": "<lan or usb ipv4>",
  "port": 17890,
  "pairingToken": "<single-use short-lived token>",
  "protocolVersion": 1,
  "pubkey": "<host identity material for future channel binding>"
}
```

Flow:

1. Caregiver opens Companion settings (or starts bridge); host mint a pairing token (~5 minutes, single use).
2. Tablet scans QR → opens WebSocket `ws://{ip}:{port}/companion`.
3. Tablet sends `hello`, then `auth` with `pairingToken` (+ device name).
4. Host validates token, creates allowlisted device + long-lived `credential`, returns `auth.ok`.
5. Tablet persists `{ hostId, deviceId, credential, lastIp, port }`.
6. Subsequent sessions: `auth` with credential only (no re-pair).

Revocation: caregiver removes device from host allowlist; tablet must re-pair.

### 5.3 Session lifecycle

| Event | Host behavior |
| --- | --- |
| Auth success | Session = active; minimize main window; set audio routing = tablet; emit UI event |
| Ping/pong | RTO measurement; drop idle sessions after configurable timeout |
| Brief disconnect | Session marked reconnecting; keep allowlist; abort in-flight dictation |
| Re-auth with credential | Resume session; re-minimize if still configured |
| Disconnect / revoke | Clear session audio routing; optional restore window (setting) |

Local touch still works if caregiver restores the window while connected.

### 5.4 Audio routing

While `companion.session = active`:

- Phrase **Speak** and companion TTS run on the **tablet** (`expo-speech` / platform TTS).
- Dictation audio is captured on the tablet and streamed to host STT (`dictation.*` / `audio.chunk`).
- Host PC mic capture and host TTS for those companion-driven paths stay **off** until disconnect.
- Groq API key remains on host; used only for host-side STT when that path is selected.

## 6. Protocol (v1)

Transport: JSON text frames on WebSocket. Envelope:

```json
{
  "v": 1,
  "id": "<client request id>",
  "type": "<message type>",
  "payload": { }
}
```

Server replies reuse `id` when responding to a request. Server may push events with no client `id` (or a server-generated id).

### 6.1 Session / auth

| Type | Direction | Purpose |
| --- | --- | --- |
| `hello` | C→S | Device name, client protocol version |
| `hello.ok` | S→C | Host protocol version, hostId |
| `auth` | C→S | `pairingToken` **or** `credential` + `deviceId` |
| `auth.ok` | S→C | `deviceId`, `credential` (on first pair), session flags |
| `auth.err` | S→C | Reason (expired token, revoked, version mismatch) |
| `ping` / `pong` | both | Liveness + RTT |
| `session.state` | S→C | active / reconnecting / audioRouting |

### 6.2 Input (host injects)

| Type | Maps to |
| --- | --- |
| `key.press` | `press_key` / shared service |
| `text.type` | `type_text` |
| `key.combo` | `press_combo` |
| `mouse.moveRel` | `move_cursor_relative` |
| `mouse.moveAbs` | `move_cursor_absolute` |
| `mouse.click` | `mouse_click` |
| `mouse.doubleClick` | `mouse_double_click` |
| `mouse.scroll` | `mouse_scroll` |

Sticky modifiers may live on the tablet UI; host remains authoritative for profile data.

### 6.3 Sync & assistive features

| Type | Purpose |
| --- | --- |
| `profile.snapshot` | Settings, phrases, quick actions, layout flags relevant to tablet |
| `profile.snapshot.ok` | Snapshot payload |
| `predict.query` | Prefix → suggestions |
| `predict.suggestions` | Suggestion list |
| `predict.record` | Record accepted word |
| `qa.launch` | Launch quick action (url/app) via host opener |
| `phrase.type` | Type phrase text on host (speak stays on tablet) |

### 6.4 Dictation (later phase)

| Type | Purpose |
| --- | --- |
| `dictation.start` / `dictation.stop` | Session control |
| `audio.chunk` | Tablet mic PCM/Opus chunks |
| `dictation.partial` / `dictation.final` | Host STT results → tablet may display; host types final text |

Idempotent reconnect: in-flight dictation aborts cleanly on drop.

### 6.5 Explicitly excluded

- Macro run/import/export
- Head-tracking calibrate/move messages

## 7. Shared services (host)

Extract thin functions from Tauri command bodies so IPC and companion share one path:

- Input: already `input::*` (`press_key`, `type_text`, mouse helpers)
- Quick actions: validate URL/app + launch
- Phrases: fetch; type-only path for companion (TTS on tablet)
- Prediction: `get_suggestions` / `record_usage`
- Profiles: snapshot builder from DB + active profile settings

Command handlers in `lib.rs` should call these services; companion dispatch does the same.

## 8. Mobile app (`companion/`)

### 8.1 Platform & form factor

- Expo app with **dev client** (not Expo Go–only) for mic and production APK.
- **Tablet-only gate**: reject phones by smallest-screen-dimension heuristic + store tablet listing.
- Landscape-first large targets (wheelchair tray).

### 8.2 Screens (MVP → parity)

1. **Gate** — phone blocked / tablet allowed  
2. **Pair** — QR scanner + manual IP fallback  
3. **Connected shell** — keyboard | trackpad | numpad | dictation, suggestions, profile/USB help, collapsed FAB (phrases / emergency / quick actions deferred; Windows host uses Normal/Mini/Teaching mode tablets — Mini Auto removed)  
4. **Reconnecting** — overlay; preserve UI state; exponential backoff  

### 8.3 Persistence

Secure/async storage for pairing credential and last endpoint. Auto-reconnect without re-pair.

### 8.4 Out of UI scope

No macros page. No head-tracking page.

## 9. USB (Android, post–Wi‑Fi MVP)

- Parent enables USB tethering (guided checklist in host + companion).
- Discovery uses the USB network interface IP; QR refresh or last-known credential reconnect.
- Same protocol and credentials as Wi‑Fi — no AOA custom stack in v1.
- Document iPad USB tether as unreliable; iOS remains Wi‑Fi-first.

## 10. Phased delivery

1. Design spec + requirements note (**this doc**)
2. Protocol + host bridge skeleton (pairing QR, auth, ping, minimize/tray hooks)
3. Android Wi‑Fi MVP — keyboard + trackpad + reconnect
4. Parity pack — numpad, tablet TTS, prediction, FAB, profile sync (phrases/QA shell deferred to v2)
5. Dictation — tablet mic → host STT → type-back
6. USB tether path + school parent UX
7. iOS TestFlight (Wi‑Fi)
8. Store packaging — Play tablet listing + APK sideload docs

**Success bar (phases 4–5):** child finishes a writing assignment using only the tablet after morning pair.

## 11. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| School Wi‑Fi client isolation | USB tether phase right after Wi‑Fi MVP |
| Expo mic / background limits | Dev client; foreground dictation only |
| Secret leakage | Never put Groq/API keys in profile.snapshot |
| Elevated target apps | Existing SendInput limitation; surface in companion UX |
| Channel security on hostile LAN | Token + device credential; bind identity (`pubkey`); TLS/Noise hardening follow-up |

## 12. Local development (target)

**Host**

```bash
# from repo root
npm run tauri dev
# Companion bridge starts via Settings or cmd_companion_start (default port 17890)
```

**Companion**

```bash
cd companion
npm install
npx expo start --dev-client
# Android tablet / emulator on same LAN; scan QR from host Companion settings
```

## 13. Open follow-ups (not blocking skeleton)

- Desktop Settings “Companion” page UI (QR render, device list, revoke)
- TLS or Noise-based channel binding beyond token auth
- Binary trackpad frames if JSON move flood is too chatty
- Play Store tablet listing + GitHub APK release automation
