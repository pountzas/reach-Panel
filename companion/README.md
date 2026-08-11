# ReachPanel Companion (tablet)

Android-first Expo app that drives the Windows ReachPanel host over a local WebSocket bridge.

## Prerequisites

- Node 20+
- Android tablet or emulator (SDK 57 Expo Go **or** a local development build)
- ReachPanel host running with companion bridge (auto-starts in `npm run tauri dev`)

## Run on device (recommended: Expo Go)

Dictation uses `expo-audio`, which is included in Expo Go for SDK 57. You do **not** need a custom native build for local dictation.

```bash
# Terminal 1 — Windows host
cd ..
npm run tauri dev
# Watch console for: [companion] pairing payload: {...}

# Terminal 2 — tablet app
cd companion
npm install
npx expo start
```

On the tablet:

1. Install **Expo Go** from the Play Store (must be recent enough for SDK 57).
2. Scan the Metro QR / open the project in Expo Go.
3. Pair with the host (paste pairing JSON or scan the host Settings QR).

If Metro was already running against an old `expo-av` bundle, clear cache once:

```bash
npx expo start -c
```

## Development / production APK (dev client)

Use a development build when you need a sideloadable APK or native modules beyond Expo Go.

```bash
cd companion
npm install

# Generates android/ (CNG) and installs a debug build on a USB-connected device/emulator
npx expo run:android

# Then start Metro against that install
npx expo start --dev-client
```

Optional EAS cloud build (requires an Expo account + `eas.json`):

```bash
npx eas build -p android --profile development
```

After changing native plugins (`app.json` → `plugins`), rebuild:

```bash
npx expo prebuild --clean
npx expo run:android
```

## What works

- Tablet-only gate
- QR scan + paste pairing JSON (host Settings → Companion shows QR)
- Auth + credential persistence + reconnect
- Keyboard, trackpad, numpad
- Phrases / emergency with **tablet TTS** (Speak)
- Quick actions (host launch)
- Prediction suggestions
- Collapsed FAB mode
- Profile sync panel (`profile.snapshot`)
- Dictation (tablet mic via `expo-audio` → host Groq STT → type-back)
- USB tether checklist + IP refresh (same protocol)

## Not yet

- iOS TestFlight

## Troubleshooting: `ExponentAV` / native module errors

SDK 57 removed `expo-av`. This app uses `expo-audio` instead. If you still see `cannot find native module ExponentAV`:

1. Confirm `companion/package.json` has `expo-audio` and **not** `expo-av`.
2. Restart with a clean cache: `npx expo start -c`.
3. Fully close Expo Go (or uninstall an old custom `com.reachpanel.companion` APK) and reopen.
4. For a custom APK only: rebuild with `npx expo run:android` so native code matches JS.
