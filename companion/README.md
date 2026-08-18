# ReachPanel Companion (tablet)

Android-first Expo app that drives the Windows ReachPanel host over a local WebSocket bridge.

For the caregiver-facing install and pairing walkthrough (Wi‑Fi + USB tether), see the root [README — Install & connect the Android companion](../README.md#install--connect-the-android-companion).

## Prerequisites

- Node 20+
- Android tablet or emulator (SDK 57 Expo Go **or** a local development build)
- ReachPanel host running; start the companion bridge from **Settings → Companion** or the Companion mode tablet

## Run on device (recommended: Expo Go)

Dictation uses `expo-audio`, which is included in Expo Go for SDK 57. You do **not** need a custom native build for local dictation.

```bash
# Terminal 1 — Windows host
cd ..
npm run tauri dev
# Then Settings → Companion → Start bridge (watch for pairing QR / payload)

# Terminal 2 — tablet app
cd companion
npm install
npx expo start
```

On the tablet:

1. Install **Expo Go** from the Play Store (must be recent enough for SDK 57).
2. Scan the Metro QR / open the project in Expo Go.
3. Pair with the host: scan the host Settings → Companion QR, or paste pairing JSON.

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
- Keyboard, trackpad (tap-to-click), numpad
- Prediction suggestions
- Collapsed FAB mode
- Profile sync panel (`profile.snapshot`)
- Dictation (tablet mic via `expo-audio` → host Groq STT → type-back)
- USB tether checklist + IP refresh (same protocol)

## Not yet

- iOS TestFlight
- Play Store listing

Caregivers install the pre-built APK from the public page: **https://reachpanel-companion.vercel.app/** (see root [README](../README.md#install--connect-the-android-companion)).

## Troubleshooting: `ExponentAV` / native module errors

SDK 57 removed `expo-av`. This app uses `expo-audio` instead. If you still see `cannot find native module ExponentAV`:

1. Confirm `companion/package.json` has `expo-audio` and **not** `expo-av`.
2. Restart with a clean cache: `npx expo start -c`.
3. Fully close Expo Go (or uninstall an old custom `com.reachpanel.companion` APK) and reopen.
4. For a custom APK only: rebuild with `npx expo run:android` so native code matches JS.
