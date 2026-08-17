# ReachPanel

Assistive virtual keyboard for Windows — built for users with severe motor disabilities who operate a touchscreen (wheelchair-mounted or school laptop) while applications run on the PC.

[License: MIT](LICENSE)
[Platform: Windows](#requirements)
[Build](https://github.com/pountzas/reach-Panel/actions/workflows/build.yml)

Built with Tauri, React, Rust, and SQLite. An optional Android tablet companion provides trackpad, numpad, and remote typing over the local network.

## Download (Windows)

Pre-built installers are on the [Releases](https://github.com/pountzas/reach-Panel/releases) page.

1. Download the latest `.msi` or `.exe` installer for Windows.
2. Run the installer. On older Windows builds, you may need the [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
3. Open the app on your accessibility touchscreen, select a profile in Settings, and position the window on the correct display.

## Install & connect the Android companion

The companion turns an Android tablet into a control surface (keyboard, trackpad, numpad, dictation, suggestions). The Windows host still injects keystrokes and mouse events into the focused app. Teaching / Music stay on Windows only.

Pairing stays in **Settings → Companion** (Start bridge / QR). Companion mode on the tablet is disabled until a tablet is connected; when one connects the host enters Companion mode and minimizes, and disconnect restores the previous mode.

### 1. Install ReachPanel on Windows

Use a [release installer](https://github.com/pountzas/reach-Panel/releases) or, for contributors, `npm run tauri dev` (the companion bridge can start from Settings).

### 2. Install the companion on an Android tablet

**Caregivers:** download the pre-built APK from the public install page:

**https://reachpanel-companion.vercel.app/**

(After the first Vercel deploy, update this URL if your project name differs.)

1. Open the link on the tablet and tap **Download APK**.
2. Allow installs from the browser if Android prompts (unknown apps).
3. Install and open ReachPanel Companion.

Phones are blocked — the companion is tablet-only.

**Contributors:** run from source with Expo Go or a local dev build — see [companion/README.md](companion/README.md) (`npx expo start`, `npx expo run:android`, or EAS).

### 3. Connect over Wi‑Fi (default)

1. Put the PC and tablet on the **same local network**.
2. On Windows: ReachPanel → **Settings → Companion**.
3. Click **Start bridge** (local WebSocket, typically port **17890**).
4. Show the QR if needed; use **New pairing code** to refresh it.
5. On the tablet: **scan the QR**, or paste JSON via **Copy pairing JSON** on the host.
6. Host session should show **Active**; the tablet shows keyboard / trackpad / numpad / dictation / suggestions.

### 4. Connect without Wi‑Fi (USB tether)

1. On the tablet: **Settings → Network → Hotspot & tethering → USB tethering**.
2. Connect tablet ↔ PC with a **data** USB cable (not charge-only).
3. On the host Companion page: **New pairing code** so the QR uses the USB network IP (often `192.168.42.x` or `192.168.137.x`).
4. Scan the updated QR (or paste JSON) on the tablet — same protocol as Wi‑Fi.
5. Already paired? A new QR updates the IP and reconnects when the host ID matches.

### 5. After you are connected

- Use the tablet for pointer (trackpad / numpad) and typing; the PC injects into the focused window.
- Tablet dictation uses the **tablet mic**. Groq API key (for languages without a Windows speech pack) stays in host Settings.
- Revoke tablets under Settings → Companion → paired devices.

### Companion troubleshooting

- Bridge stopped → **Start bridge** again.
- Pairing fails → same LAN or USB tether; refresh with **New pairing code**; allow local inbound traffic if a firewall blocks the bridge port.
- Expo / audio module errors → [companion/README.md](companion/README.md) troubleshooting.

## Screenshots


| Main layout          | Modes / Teaching | Settings / Companion |
| -------------------- | ---------------- | -------------------- |
| Main keyboard layout | Mini or Teaching | Settings + companion QR |


*Replace with captures from your release build when ready — see [docs/images/README.md](docs/images/README.md).*

## Features

### Modes

- **Normal** — full typing keyboard and predictive suggestions
- **Mini** — compact keyboard; collapses to a branded FAB when idle; optional transparent outlined keys (white / dark gray / silver)
- **Teaching** — fullscreen work area with Music lesson + piano/synth (2–5 octaves, partiture, built-in songs and file import); Math and Language lesson slots are placeholders for now

### Keyboard

- System-wide keyboard injection with sticky modifiers
- Colors, opacity, and panel-driven key sizing
- Fn key on the bottom row maps number keys 1–0 and `-` `=` to F1–F12
- Language switch key with country flag icons (follows installed Windows keyboards)
- On-screen layout override (auto / QWERTY / QWERTZ / AZERTY / Greek)
- Predictive text with offline word packs (English bundled; other languages downloadable), learns from typing, disable toggle
- Dictation key beside Right Ctrl (see Voice dictation below)

### Android tablet companion

- Pair via Settings → Companion (QR, paste JSON, or USB tether)
- Tablet: keyboard, trackpad (tap-to-click), numpad, dictation, suggestions
- Host-only injection; Teaching / Music remain on Windows

### Voice dictation (Windows)

- Dictate key on the keyboard (right of Right Ctrl)
- Uses the **typing language**, not the UI language
- **English and Western European languages (DE, FR, IT, ES, PT):** Windows Speech Recognition (WinRT) when the speech language pack is installed and online speech is allowed
- **Greek and other languages without a Windows speech pack:** [Groq](https://groq.com) cloud Whisper (`whisper-large-v3-turbo`) over the internet
- After the first Groq use that local day, the key can show remaining daily request % (RPD)

#### Set up Groq for Greek dictation

1. Create a free account at [console.groq.com](https://console.groq.com).
2. Open **API Keys** and create a key (starts with `gsk_…`).
3. In ReachPanel, open **Settings**.
4. Under the keyboard / dictation options, paste the key into **Groq API key (cloud dictation)**.
5. Set **typing language** to Greek (EL), then use the dictate key on the keyboard.

You can also set the `GROQ_API_KEY` environment variable instead of (or as a fallback for) the Settings field. An internet connection is required for cloud dictation. WinRT dictation for English and Western European languages does not need a Groq key.

If Windows online speech is off, open **Settings → Privacy & security → Speech** and turn on **Online speech recognition**. For speech packs, use **Settings → Time & language → Speech**.

### Profiles & accessibility

- Named file-based profiles (create, save, load, wipe)
- Multi-monitor detection and positioning
- Color profiles and optional background image
- In-app update check and prompt
- About section (version and links)
- UI languages: English, Greek, German, French, Italian, Spanish, Portuguese

## Requirements

**Windows 10 or 11 only.** ReachPanel is not supported on macOS — touchscreens on macOS expose only single-point touch, which breaks the multi-touch layout and monitor targeting this app requires.

Companion: Android tablet on the same LAN as the PC, or USB tethering. See [Install & connect the Android companion](#install--connect-the-android-companion).

For development:

- Node.js 18+ (Node 20+ for the companion Expo app)
- Rust (via [rustup](https://rustup.rs/))
- Visual Studio Build Tools with the C++ workload

## Development

```bash
npm install
npm run tauri dev
```

For Rust builds on Windows, ensure the MSVC environment is active. If `link.exe` is not found, run from a Developer Command Prompt or use:

```bat
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
```

Companion app: [companion/README.md](companion/README.md).

### Public install site (Vercel)

The caregiver APK page lives at [docs/install/index.html](docs/install/index.html) and deploys to Vercel. CI replaces `__INSTALL_APK_PUBLIC_URL__` with the Blob URL before publish.

One-time GitHub Actions secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| ------ | ------- |
| `EXPO_TOKEN` | EAS build auth |
| `EAS_PROJECT_ID` | Expo project (run `eas init` inside `companion/` — do not invent a UUID) |
| `VERCEL_TOKEN` | Vercel deploy |
| `VERCEL_ORG_ID` | Vercel team / user |
| `VERCEL_PROJECT_ID` | Vercel project for `docs/install` |
| `BLOB_READ_WRITE_TOKEN` | Upload APK to Vercel Blob |

Optional repository variable: `INSTALL_APK_PUBLIC_URL` (override the default Blob URL if needed).

Before the first CI run, inside `companion/`: `eas init` and `eas credentials` for Android signing.

## Build from source

```bash
npm run tauri build
```

Installers and executables are written to:

```
src-tauri/target/release/bundle/
```

## Releases

Windows installers are built in CI and published automatically when a [release-please](https://github.com/googleapis/release-please) Release PR is merged on `main`. Development happens on `dev`; merging `dev` → `main` opens the Release PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full branch and versioning workflow.

## Architecture


| Path                                 | Responsibility                                                       |
| ------------------------------------ | -------------------------------------------------------------------- |
| `src/`                               | React frontend (keyboard, modes, teaching, settings, companion UI)   |
| `src-tauri/src/input/`               | Keyboard/mouse injection (Windows `SendInput`)                       |
| `src-tauri/src/window/`              | Monitor enumeration and taskbar-aware layout (Windows APIs)          |
| `src-tauri/src/tts/`                 | Text-to-speech (Windows SAPI / WinRT)                                |
| `src-tauri/src/stt/`                 | Voice dictation (WinRT speech recognition; Groq cloud fallback)      |
| `src-tauri/src/db/`                  | SQLite persistence (profiles, phrases, macros)                       |
| `src-tauri/src/prediction/`          | Predictive text + word-pack install/download                         |
| `src-tauri/src/companion/`           | Android tablet WebSocket bridge (pairing, session, dispatch)         |
| `src-tauri/src/profiles/`            | File-based named profiles                                            |
| `companion/`                         | Expo Android companion app                                           |
| `src-tauri/resources/wordpacks/`     | Bundled English dictionary                                           |
| `wordpacks-dist/`                    | Downloadable packs for GitHub `wordpacks-v1` release                 |
| `docs/accessibility-requirements.md` | Target users and acceptance criteria                                 |

## Roadmap

- Eye tracking support
- AutoHotkey macro import
- iOS companion (TestFlight)
- Remove leftover Windows chrome for mouse panel, phrases, Quick Actions, macros, and head tracking (tablet trackpad/numpad stays)

## Known limitations

- Input injection does not work into elevated (admin) applications or UAC prompts
- Voice dictation is Windows-only on the host; Greek (and other WinRT-unsupported languages) need a Groq API key and internet
- Cloud dictation is utterance-based (speak, pause) rather than fully continuous streaming
- Companion needs the same LAN or USB tether; Teaching / Music are not available on the tablet

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/accessibility-requirements.md](docs/accessibility-requirements.md) before opening a pull request.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a security vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This is assistive software, not a medical device. Test thoroughly with your own hardware and accessibility setup before relying on it in daily use.
