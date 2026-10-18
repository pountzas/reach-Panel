# Changelog

All notable changes to this project are documented here. Release binaries are published on [GitHub Releases](https://github.com/pountzas/reach-Panel/releases).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Changed

- **Mini Mode** is now called **Focus** (mode tablet) / **Focus mode** in settings and related UI copy across all locales.
- Internal identifiers renamed to Focus (`focusMode*`, app mode `"focus"`, Rust `focus_mode`); persisted `miniMode*` settings keys migrate on load.
- **Mode menu:** the collapsed **R** button now opens a mode menu (Show keyboard, Normal, Focus, Mic, Teaching, Companion) instead of expanding directly.
- Live input preview and suggestion chips now share one centered row with show/hide animation (#201); the preview only captures while a text field is focused.
- **Teaching polish (#275):** "Show input helpers in Teaching mode" moved to **Settings → Visible sections**; description is suggestions + mic only (live preview is never shown in Teaching). Language Spelling / Free write use a left vertical tab rail; Free write notepad/PDF toolbar buttons are smaller. Music octave controls sit closer under the keyboard header. Docked minimize and FAB mode transitions use GPU-composited transform/opacity motion.

### Added

- **Mic mode:** Focus-mode internals with a mic FAB and no keyboard auto-show; the mic arms only when a text field is focused.
- Floating dictation overlay (visualizer + Stop) shown while dictation is active, excluded from screen capture.
- **Teaching keyboard Minimize / Focus** (Language and Mathematics): header controls hide keys while keeping the window size; Focus auto-minimizes until an in-app input (or physical typing) restores the keyboard. States are not persisted (#272).
- Teaching Spelling and Free write (notepad / PDF text) produce and apply suggestion chips when helpers and suggestions are on (#270).

### Removed

- Legacy v1 features that were already hidden: **Phrases**, **Quick Actions**, **Macro Builder** and **head tracking** (#232). **On first launch this version permanently deletes their saved data** (custom phrases, quick actions and macros); it is not kept in profile exports and cannot be restored.
- The large-header sizing option and the legacy free-float section layouts. Older settings files fall back to the default docked layout.

### Fixed

- Text-field detection: number inputs (spinbutton) count as text, select-only comboboxes (Chromium `<select>`, Base UI/shadcn Select buttons) and read-only custom text no longer do, and contenteditable iframe editors (TinyMCE, CKEditor 4) are detected.
- Dictation no longer gets stuck as "already active" after a WinRT silence timeout; timeouts and pauses no longer show an error.
- Teaching no longer keeps native live-input capture running while the preview is hidden (#269).
- Free write PDF: drawing, erasing and dragging text no longer copy the whole annotation document on every pen move; pages render sharp at Windows display scaling; window animations skip unchanged section resizes; the live input preview skips unchanged frames and pauses during window animations; keyboard keys re-render less on settings changes (#282).
- Teaching PDFs are read only from files picked in the app or stored in the Teaching folder; PDFs opened before this update keep working (#291).
- Selecting or dragging a PDF text box with the pointer tool no longer restores a minimized Teaching keyboard (#292).
- Bumped rustls to 0.23.46 for TLS advisories (#290).

## 0.17.0 (2026-10-18)

## What's Changed
* feat: GPU-composited UI motion for Focus and overlays by @pountzas in https://github.com/pountzas/reach-Panel/pull/229
* feat: add Settings slider for keyboard button font size by @pountzas in https://github.com/pountzas/reach-Panel/pull/230
* fix: keep Normal/Focus height from grip without content snap by @pountzas in https://github.com/pountzas/reach-Panel/pull/231
* chore: remove hidden v1 features and isolate teaching section by @pountzas in https://github.com/pountzas/reach-Panel/pull/232
* Code health cleanup epic (#244) by @pountzas in https://github.com/pountzas/reach-Panel/pull/260
* Follow-up #260: suggestion IPC errors + Rust CI by @pountzas in https://github.com/pountzas/reach-Panel/pull/261
* feat(teaching): Free write PDF Slice 1 — single active document by @pountzas in https://github.com/pountzas/reach-Panel/pull/263
* feat(teaching): Free write PDF ink/text (Slice 2) by @pountzas in https://github.com/pountzas/reach-Panel/pull/264
* feat(teaching): Free write PDF export & appearances (Slice 3) by @pountzas in https://github.com/pountzas/reach-Panel/pull/265
* Teaching mode: Settings toggle for input helpers (#262) by @pountzas in https://github.com/pountzas/reach-Panel/pull/266
* feat(teaching): Free write PDF single document, ink, and export (#168) by @pountzas in https://github.com/pountzas/reach-Panel/pull/267
* feat(teaching): Teaching mode polish epic — settings, helpers, layout, minimize, animations by @pountzas in https://github.com/pountzas/reach-Panel/pull/276
* fix(teaching): stop annotation-doc copies on every ink move by @pountzas in https://github.com/pountzas/reach-Panel/pull/285
* fix(layout): skip section-tree re-renders on resize frames (Part of #282, Fixes #279) by @pountzas in https://github.com/pountzas/reach-Panel/pull/283
* perf(input-preview): skip unchanged frames and pause during animations by @pountzas in https://github.com/pountzas/reach-Panel/pull/284
* fix(teaching): sharp Free Write PDF at display scale (Part of #282, Fixes #278) by @pountzas in https://github.com/pountzas/reach-Panel/pull/286
* perf(keyboard): narrow settings subs and memo KeyButton (Part of #282, Fixes #281) by @pountzas in https://github.com/pountzas/reach-Panel/pull/287
* perf: land epic-282-performance hotspots into dev (Part of #282) by @pountzas in https://github.com/pountzas/reach-Panel/pull/288
* fix: harden Teaching PDF read path validation by @pountzas in https://github.com/pountzas/reach-Panel/pull/291
* fix: keep keyboard minimized on PDF text box select by @pountzas in https://github.com/pountzas/reach-Panel/pull/293
* dev → main: Focus mode, motion, Mic mode, v1 cleanup, and 0.17 prep by @pountzas in https://github.com/pountzas/reach-Panel/pull/235


**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.16.0...v0.17.0

## 0.16.0 (2026-10-12)

## What's Changed
* fix: dictation silence timeout no longer sticks the mic by @pountzas in https://github.com/pountzas/reach-Panel/pull/214
* Rename Mini Mode to Focus mode (#177) by @pountzas in https://github.com/pountzas/reach-Panel/pull/215
* feat: blank live preview until editable focus by @pountzas in https://github.com/pountzas/reach-Panel/pull/216
* fix: keep WinRT dictation from restarting while StopAsync is in flight by @pountzas in https://github.com/pountzas/reach-Panel/pull/217
* fix: Focus mode keyboard ignores select-only dropdowns (#197) by @pountzas in https://github.com/pountzas/reach-Panel/pull/218
* feat: show shared dictation overlay at screen bottom-center by @pountzas in https://github.com/pountzas/reach-Panel/pull/219
* Suggestions beside live preview with centered pair animation (#201) by @pountzas in https://github.com/pountzas/reach-Panel/pull/220
* feat: add Mic mode with collapsed FAB and no keyboard auto-show by @pountzas in https://github.com/pountzas/reach-Panel/pull/221
* feat: open mode menu from collapsed R button (#205) by @pountzas in https://github.com/pountzas/reach-Panel/pull/222
* Dev by @pountzas in https://github.com/pountzas/reach-Panel/pull/223


**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.15.1...v0.16.0

## 0.15.1 (2026-10-05)

## What's Changed

- fix(deps): Dependabot security updates (companion npm) by @pountzas in https://github.com/pountzas/reach-Panel/pull/186
- fix: Mini Mode focus for YouTube contenteditable comments by @pountzas in https://github.com/pountzas/reach-Panel/pull/187
- fix: stabilize live preview tracking and avoid ReachPanel occlusion by @pountzas in https://github.com/pountzas/reach-Panel/pull/188
- fix: promote Mini Mode YouTube focus, live preview stability, and security patches by @pountzas in https://github.com/pountzas/reach-Panel/pull/189

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.15.0...v0.15.1

## 0.15.0 (2026-10-04)

## What's Changed

- fix: wait for Backspace inject gate before suggestions by @pountzas in https://github.com/pountzas/reach-Panel/pull/163
- Teaching mode: hide preview/suggestions during session by @pountzas in https://github.com/pountzas/reach-Panel/pull/170
- Free write: themed centered modal for Clear all confirmation by @pountzas in https://github.com/pountzas/reach-Panel/pull/173
- fix: hide Teaching height grip and pad Mini Mode toolbar by @pountzas in https://github.com/pountzas/reach-Panel/pull/180
- feat: remove on-screen layout override; follow Windows in Settings by @pountzas in https://github.com/pountzas/reach-Panel/pull/179
- chore(deps): bump actions/setup-node from 4 to 7 by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/72
- chore(deps): bump softprops/action-gh-release from 2 to 3 by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/138
- chore(deps): bump expo/expo-github-action from 8 to 9 by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/139
- chore(deps): bump the npm-minor-and-patch group across 1 directory with 14 updates by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/171
- chore(deps): bump the cargo-minor-and-patch group across 1 directory with 6 updates by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/172
- feat: launch ReachPanel at Windows sign-in (#174) by @pountzas in https://github.com/pountzas/reach-Panel/pull/182
- dev → main: CI check after Dependabot bumps by @pountzas in https://github.com/pountzas/reach-Panel/pull/181

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.14.0...v0.15.0

## 0.14.0 (2026-09-16)

## What's Changed

- fix: Greek Caps, height grips, Groq link, About icons, Backspace repeat by @pountzas in https://github.com/pountzas/reach-Panel/pull/159
- fix: PR #159 review findings (backspace gate, a11y, caps, rust warnings) by @pountzas in https://github.com/pountzas/reach-Panel/pull/161
- fix: Greek Caps, height grips, Groq link, About icons, Backspace repeat by @pountzas in https://github.com/pountzas/reach-Panel/pull/160

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.13.2...v0.14.0

## 0.13.2 (2026-09-11)

## What's Changed

- fix: stop downloads merge retries from wiping the Android APK by @pountzas in https://github.com/pountzas/reach-Panel/pull/155
- fix: stop downloads merge retries from wiping the Android APK by @pountzas in https://github.com/pountzas/reach-Panel/pull/156

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.13.1...v0.13.2

## 0.13.1 (2026-09-11)

## What's Changed

- ci: use Node 22 so current eas-cli can install by @pountzas in https://github.com/pountzas/reach-Panel/pull/153

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.13.0...v0.13.1

## 0.13.0 (2026-09-11)

## What's Changed

- chore(deps): bump the npm-minor-and-patch group across 1 directory with 5 updates by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/141
- fix: resolve pdfjs-dist Dependabot alert (GHSA-hq66-cqwq-w95j) by @pountzas in https://github.com/pountzas/reach-Panel/pull/145
- feat: dual-platform downloads landing page by @pountzas in https://github.com/pountzas/reach-Panel/pull/149
- fix: companion i18n, QR scan, shared live preview, line-strip crop by @pountzas in https://github.com/pountzas/reach-Panel/pull/150
- feat: companion live preview, language switch, and downloads landing by @pountzas in https://github.com/pountzas/reach-Panel/pull/151

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.12.0...v0.13.0

## 0.12.0 (2026-08-25)

## What's Changed

- feat: per-monitor taskbar control and keyboard UX polish by @pountzas in https://github.com/pountzas/reach-Panel/pull/132
- feat: live input preview above keyboard with per-mode settings by @pountzas in https://github.com/pountzas/reach-Panel/pull/134
- feat: add Teaching language spelling lessons with Greek compose and custom lists by @pountzas in https://github.com/pountzas/reach-Panel/pull/135
- fix: harden Win11 taskbar top apply and drop left/right by @pountzas in https://github.com/pountzas/reach-Panel/pull/142
- chore: promote dev to main (taskbar top hardening) by @pountzas in https://github.com/pountzas/reach-Panel/pull/143

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.11.2...v0.12.0

## 0.11.2 (2026-08-20)

## What's Changed

- Dev by @pountzas in https://github.com/pountzas/reach-Panel/pull/136

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.11.1...v0.11.2

## 0.11.1 (2026-08-18)

## What's Changed

- fix: load companion version from CJS so EAS can evaluate app.config by @pountzas in https://github.com/pountzas/reach-Panel/pull/128
- docs: add a QR code for the companion APK install page by @pountzas in https://github.com/pountzas/reach-Panel/pull/129
- fix: evaluate companion Expo config so the Android APK release can run by @pountzas in https://github.com/pountzas/reach-Panel/pull/130

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.11.0...v0.11.1

## 0.11.0 (2026-08-18)

## What's Changed

- feat: arm Companion mode from the Settings tablet before a tablet connects by @pountzas in https://github.com/pountzas/reach-Panel/pull/118
- fix: apply companion review fixes for APK CI and host session handling by @pountzas in https://github.com/pountzas/reach-Panel/pull/126
- feat: companion mode tablet and public Android APK install by @pountzas in https://github.com/pountzas/reach-Panel/pull/125

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.10.1...v0.11.0

## 0.10.1 (2026-08-13)

## What's Changed

- fix(deps): resolve Dependabot security alerts by @pountzas in https://github.com/pountzas/reach-Panel/pull/113
- fix: keep mini keyboard on real text fields in Chrome by @pountzas in https://github.com/pountzas/reach-Panel/pull/114
- fix: keep mini keyboard on real text fields in Chrome by @pountzas in https://github.com/pountzas/reach-Panel/pull/116

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.10.0...v0.10.1

## 0.10.0 (2026-08-13)

## What's Changed

- fix: surface updater check failures and serve latest.json via raw GitHub by @pountzas in https://github.com/pountzas/reach-Panel/pull/109
- feat: hide unused v1 chrome, add Teaching modes, and ship tablet companion by @pountzas in https://github.com/pountzas/reach-Panel/pull/110
- feat: hide unused v1 chrome, add Teaching modes, and ship tablet companion by @pountzas in https://github.com/pountzas/reach-Panel/pull/111

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.9.0...v0.10.0

## 0.9.0 (2026-08-12)

## What's Changed

- fix: theme update prompt and fix tool-window touch drag/placement by @pountzas in https://github.com/pountzas/reach-Panel/pull/107

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.8.0...v0.9.0

## 0.8.0 (2026-08-12)

## What's Changed

- feat: tool-window drag and transparent key colors by @pountzas in https://github.com/pountzas/reach-Panel/pull/105

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.7.0...v0.8.0

## 0.7.0 (2026-08-12)

## What's Changed

- fix: stabilize touch trackpad cursor and add tap-to-click by @pountzas in https://github.com/pountzas/reach-Panel/pull/100
- chore(deps-dev): bump the npm-minor-and-patch group with 5 updates by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/98
- feat: mini mode layout fixes and Windows-only platform by @pountzas in https://github.com/pountzas/reach-Panel/pull/101
- fix: address PR review findings across Mini Mode input and tooling by @pountzas in https://github.com/pountzas/reach-Panel/pull/103
- feat: promote mini mode and Windows-only layout fixes to main by @pountzas in https://github.com/pountzas/reach-Panel/pull/102

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.6.2...v0.7.0

## 0.6.2 (2026-08-01)

## What's Changed

- fix(security): harden CSP, asset scope, and IPC file/launch paths by @pountzas in https://github.com/pountzas/reach-Panel/pull/88
- perf: cut IPC storm from keyboard poll, trackpad, and head tracking by @pountzas in https://github.com/pountzas/reach-Panel/pull/89
- fix: unblock Tokio/IPC for speak, macros, STT, and native dialogs by @pountzas in https://github.com/pountzas/reach-Panel/pull/90
- fix: stop profile settings from resetting on startup and switch by @pountzas in https://github.com/pountzas/reach-Panel/pull/91
- feat: add classical songs and partiture lesson layout by @pountzas in https://github.com/pountzas/reach-Panel/pull/92
- feat: enhance predictive text with offline word packs by @pountzas in https://github.com/pountzas/reach-Panel/pull/93
- Dev by @pountzas in https://github.com/pountzas/reach-Panel/pull/95

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.6.1...v0.6.2

## 0.6.1 (2026-07-31)

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.6.0...v0.6.1

## 0.6.0 (2026-07-31)

## What's Changed

- feat: collapse window to branded bottom-right circle FAB by @pountzas in https://github.com/pountzas/reach-Panel/pull/66
- feat: add compact input area toggle and trackpad controls by @pountzas in https://github.com/pountzas/reach-Panel/pull/67
- Separate app UI language from typing language by @pountzas in https://github.com/pountzas/reach-Panel/pull/68
- feat: add voice dictation with WinRT speech recognition by @pountzas in https://github.com/pountzas/reach-Panel/pull/75
- feat: react-hot-toast notifications and stable section layout by @pountzas in https://github.com/pountzas/reach-Panel/pull/77
- feat: large headers mode for easier height resize by @pountzas in https://github.com/pountzas/reach-Panel/pull/78
- chore(deps): bump the npm-minor-and-patch group across 1 directory with 6 updates by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/76
- chore(deps): bump the cargo-minor-and-patch group across 1 directory with 5 updates by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/74
- feat: tighten default profile settings and add save/delete/wipe by @pountzas in https://github.com/pountzas/reach-Panel/pull/79
- feat: open settings and tools in separate OS windows by @pountzas in https://github.com/pountzas/reach-Panel/pull/80
- fix: tool window theme and settings blocking by @pountzas in https://github.com/pountzas/reach-Panel/pull/81
- fix: show header action hover labels below controls by @pountzas in https://github.com/pountzas/reach-Panel/pull/82
- feat: sliding piano range and clearer teaching playback by @pountzas in https://github.com/pountzas/reach-Panel/pull/83
- feat: replace local Whisper dictation with Groq cloud STT by @pountzas in https://github.com/pountzas/reach-Panel/pull/84
- feat: docked section stack with undock, and icon-based quick actions by @pountzas in https://github.com/pountzas/reach-Panel/pull/85
- feat: detect and switch Windows keyboard languages and on-screen layouts by @pountzas in https://github.com/pountzas/reach-Panel/pull/86

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.5.1...v0.6.0

## 0.5.1 (2026-07-09)

## What's Changed

- Add About section to settings by @pountzas in https://github.com/pountzas/reach-Panel/pull/62
- chore(deps): bump tauri from 2.11.3 to 2.11.5 in /src-tauri in the cargo-minor-and-patch group across 1 directory by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/58
- chore(deps-dev): bump vite from 8.1.0 to 8.1.3 in the npm-minor-and-patch group by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/57
- chore(deps): bump actions/download-artifact from 4 to 8 by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/56
- chore(deps): bump actions/checkout from 6 to 7 by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/55
- chore(deps): bump actions/upload-artifact from 4 to 7 by @dependabot[bot] in https://github.com/pountzas/reach-Panel/pull/54
- chore(deps): merge Dependabot security and dependency updates by @pountzas in https://github.com/pountzas/reach-Panel/pull/63
- Release dev to main — ReachPanel rename, about section, dependency updates by @pountzas in https://github.com/pountzas/reach-Panel/pull/64

**Full Changelog**: https://github.com/pountzas/reach-Panel/compare/v0.5.0...v0.5.1

## 0.5.0 (2026-07-08)

## What's Changed

- feat: restore mouse panel left/right placement toggle by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/53
- feat: replace mouse speed slider with 5-phase icon switch by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/59
- Dev by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/60

**Full Changelog**: https://github.com/pountzas/accessibility-keyboard/compare/v0.4.0...v0.5.0

## 0.4.0 (2026-07-02)

## What's Changed

- Adaptive window layout with taskbar-aware placement and collapse animation by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/44
- chore(deps): bump actions/checkout from 6 to 7 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/39
- chore(deps): bump windows-future from 0.2.1 to 0.3.2 in /src-tauri by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/28
- chore(deps): bump rfd from 0.15.4 to 0.17.2 in /src-tauri by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/30
- chore(deps): bump rusqlite from 0.32.1 to 0.40.1 in /src-tauri by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/29
- chore(deps): bump the cargo-minor-and-patch group across 1 directory with 2 updates by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/40
- chore(deps): bump the npm-minor-and-patch group with 3 updates by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/41
- chore(deps-dev): bump typescript from 5.8.3 to 6.0.3 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/25
- chore(deps-dev): bump vite from 7.3.5 to 8.1.0 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/42
- chore(deps-dev): bump @vitejs/plugin-react from 4.7.0 to 6.0.3 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/43
- Release dev: v0.3.0 features, adaptive window layout, and dependency updates by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/45
- Fix synthesizer slide-to-note touch behavior by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/46
- feat: add in-app auto-update on startup by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/47
- Replace F-key row with Fn modifier key by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/48
- feat: refactor settings UI and fix background image picker by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/50
- fix: skip updater signing in PR build workflow by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/51
- Release dev to main (0.3.0 + Fn key, updater, layout improvements) by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/49

**Full Changelog**: https://github.com/pountzas/accessibility-keyboard/compare/v0.3.0...v0.4.0

## 0.3.0 (2026-06-25)

## What's Changed

- chore(deps): bump the npm-minor-and-patch group across 1 directory with 4 updates by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/34
- chore(deps): bump the cargo-minor-and-patch group across 1 directory with 2 updates by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/33
- chore(deps): bump actions/checkout from 4 to 6 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/23
- chore(deps): bump actions/setup-node from 4 to 6 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/22
- chore(deps): bump actions/upload-artifact from 4 to 7 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/20
- chore(deps): bump googleapis/release-please-action from 4 to 5 by @dependabot[bot] in https://github.com/pountzas/accessibility-keyboard/pull/21
- feat: add resizable sections with keyboard and mouse layout improvements by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/37

## New Contributors

- @dependabot[bot] made their first contribution in https://github.com/pountzas/accessibility-keyboard/pull/34

**Full Changelog**: https://github.com/pountzas/accessibility-keyboard/compare/v0.2.3...v0.3.0

## 0.2.3 (2026-06-23)

## What's Changed

- chore: route Dependabot to dev and limit CI to dev-to-main PRs by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/35

**Full Changelog**: https://github.com/pountzas/accessibility-keyboard/compare/v0.2.2...v0.2.3

## 0.2.2 (2026-06-17)

## What's Changed

- chore: update GitHub Actions workflows to use latest action versions … by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/31

**Full Changelog**: https://github.com/pountzas/accessibility-keyboard/compare/v0.2.1...v0.2.2

## 0.2.1 (2026-06-16)

## What's Changed

- chore: manage Dependabot alerts and document glib upstream risk by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/6
- fix: eliminate Rust compiler warnings in tauri dev builds by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/7
- Dev by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/18

**Full Changelog**: https://github.com/pountzas/accessibility-keyboard/compare/v0.2.0...v0.2.1

## [Unreleased]

### Changed

- Updated documentation links from `nik/accessibility-keyboard` to `pountzas/accessibility-keyboard` in README, CONTRIBUTING, CHANGELOG, and SECURITY.
- README: documented numpad toggle, function keys, synthesizer mode, flag icons, and experimental macOS CI builds.

## 0.2.0 (2026-06-11)

## What's Changed

- feat: accessibility improvements by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/1
- chore: merge dev into main by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/2
- fix: align release-please tags with existing v{version} format by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/3
- Dev by @pountzas in https://github.com/pountzas/accessibility-keyboard/pull/4

## New Contributors

- @pountzas made their first contribution in https://github.com/pountzas/accessibility-keyboard/pull/1

**Full Changelog**: https://github.com/pountzas/accessibility-keyboard/compare/v0.1.0...v0.2.0

## [0.1.0] - 2026-06-10

### Added

- Initial open-source release
- Virtual keyboard with sticky modifiers and adjustable layout
- Virtual trackpad with configurable placement
- Quick Actions, communication phrases, and Windows SAPI TTS
- Profiles (Child, Parent, Therapist)
- Multi-monitor support
- Predictive text (English + Greek)
- Macro builder with JSON import/export
- Head tracking calibration wizard

[0.1.0]: https://github.com/pountzas/reach-Panel/releases/tag/v0.1.0
