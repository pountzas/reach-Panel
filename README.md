# ReachPanel

Assistive virtual keyboard and mouse for Windows — built for users with severe motor disabilities who operate a wheelchair-mounted touchscreen while applications run on a laptop display.

[License: MIT](LICENSE)
[Platform: Windows](#requirements)
[Build](https://github.com/pountzas/reach-Panel/actions/workflows/build.yml)

Built with Tauri, React, Rust, and SQLite.

## Download (Windows)

Pre-built installers are on the [Releases](https://github.com/pountzas/reach-Panel/releases) page.

1. Download the latest `.msi` or `.exe` installer for Windows.
2. Run the installer. On older Windows builds, you may need the [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
3. Open the app on your accessibility monitor (wheelchair-mounted touchscreen), select a profile in Settings, and position the window on the correct display.

> **macOS builds are experimental.** CI produces `.dmg` bundles, but input injection and TTS still require Windows APIs for full functionality. See [Roadmap](#roadmap).



## Screenshots


| Main layout          | Virtual trackpad | Settings       |
| -------------------- | ---------------- | -------------- |
| Main keyboard layout | Virtual trackpad | Settings panel |


*Replace with captures from your release build when ready — see [docs/images/README.md](docs/images/README.md).*

## Features



### Keyboard

- System-wide keyboard injection with sticky modifiers
- Adjustable on-screen keyboard (size, spacing, colors, opacity)
- Fn key on the bottom row maps number keys 1–0 and `-` `=` to F1–F12
- Keyboard / synthesizer mode toggle with two-octave piano keyboard
- Language switch key with country flag icons (follows installed Windows keyboards)
- Predictive text with offline word packs (English bundled; other languages downloadable), learns from typing, disable toggle
- Macro builder with JSON import/export



### Mouse

- Virtual trackpad with left/right/floating placement
- Move, click, scroll from the accessibility touchscreen
- Toggle between trackpad and on-screen numeric keypad



### Communication

- Quick Actions bar (launch apps and URLs)
- Communication phrases with TTS (Windows SAPI)
- Emergency phrase section with show/hide toggle



### Voice dictation (Windows)

- Mic control on the keyboard toolbar (enable **Show dictation (mic)** in Settings)
- Uses the **typing language**, not the UI language
- **English and Western European languages (DE, FR, IT, ES, PT):** Windows Speech Recognition (WinRT) when the speech language pack is installed and online speech is allowed
- **Greek and other languages without a Windows speech pack:** [Groq](https://groq.com) cloud Whisper (`whisper-large-v3-turbo`) over the internet



#### Set up Groq for Greek dictation

1. Create a free account at [console.groq.com](https://console.groq.com).
2. Open **API Keys** and create a key (starts with `gsk_…`).
3. In ReachPanel, open **Settings**.
4. Under the keyboard / dictation options, paste the key into **Groq API key (cloud dictation)**.
5. Set **typing language** to Greek (EL), enable the mic control if needed, then start dictation.

You can also set the `GROQ_API_KEY` environment variable instead of (or as a fallback for) the Settings field. An internet connection is required for cloud dictation. WinRT dictation for English and Western European languages does not need a Groq key.

If Windows online speech is off, open **Settings → Privacy & security → Speech** and turn on **Online speech recognition**. For speech packs, use **Settings → Time & language → Speech**.

### Profiles & accessibility

- Profiles (Child, Parent, Therapist)
- Multi-monitor detection and positioning
- Head tracking calibration wizard (webcam-based)
- UI languages: English, Greek, German, French, Italian, Spanish, Portuguese



## Requirements

**Full assistive functionality: Windows 10 or 11.**

macOS builds run the UI for development and testing; system-wide keyboard, mouse, and speech features are not yet implemented on macOS.

For development:

- Node.js 18+
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



## Build from source

```bash
npm run tauri build
```

Installers and executables are written to:

```
src-tauri/target/release/bundle/
```



## Releases

Windows and macOS bundles are built in CI. Windows installers are published automatically when a [release-please](https://github.com/googleapis/release-please) Release PR is merged on `main`. Development happens on `dev`; merging `dev` → `main` opens the Release PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full branch and versioning workflow.

## Architecture


| Path                                 | Responsibility                                                       |
| ------------------------------------ | -------------------------------------------------------------------- |
| `src/`                               | React frontend (keyboard, mouse, phrases, settings, head tracking)   |
| `src-tauri/src/input/`               | Platform keyboard/mouse injection (Windows `SendInput`; macOS stubs) |
| `src-tauri/src/window/`              | Monitor enumeration (Windows APIs; macOS stub)                       |
| `src-tauri/src/tts/`                 | Text-to-speech (Windows SAPI / WinRT; macOS stub)                    |
| `src-tauri/src/stt/`                 | Voice dictation (WinRT speech recognition; Groq cloud fallback)      |
| `src-tauri/src/db/`                  | SQLite persistence (profiles, phrases, macros)                       |
| `src-tauri/src/prediction/`          | Predictive text + word-pack install/download                         |
| `src-tauri/resources/wordpacks/`     | Bundled English dictionary                                           |
| `wordpacks-dist/`                    | Downloadable packs for GitHub `wordpacks-v1` release                 |
| `docs/accessibility-requirements.md` | Target users and acceptance criteria                                 |




## Roadmap

- Eye tracking support
- AutoHotkey macro import
- macOS port: CGEvent input, AVSpeechSynthesizer, native monitor APIs (experimental CI builds in progress)



## Known limitations

- Input injection does not work into elevated (admin) applications or UAC prompts
- macOS bundles lack system-wide input and TTS until the native backends land
- Voice dictation is Windows-only; Greek (and other WinRT-unsupported languages) need a Groq API key and internet
- Cloud dictation is utterance-based (speak, pause) rather than fully continuous streaming



## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/accessibility-requirements.md](docs/accessibility-requirements.md) before opening a pull request.

Please read our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

To report a security vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

This is assistive software, not a medical device. Test thoroughly with your own hardware and accessibility setup before relying on it in daily use.