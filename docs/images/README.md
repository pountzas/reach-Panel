# README screenshots

These images appear in the root [README.md](../../README.md).

| File | Content |
|------|---------|
| `companion-apk-qr.png` | QR for the public companion APK install page |
| `keyboard.png` | Normal mode: typing keyboard + suggestions |
| `modes.png` | Mini (compact / FAB) or Teaching (Music lesson + piano) |
| `settings.png` | Settings with Companion QR / bridge controls |

## Regenerating from a release build

1. Run `npm run tauri dev` or install a release build.
2. Capture PNG screenshots at roughly 1200×700 (main window size).
3. Replace the files in this folder and commit.

Use Windows **Snipping Tool** or **Win+Shift+S** for captures. Prefer a named profile and Normal mode for the main keyboard shot; include Companion Settings for the third image.

To regenerate the companion APK QR (install page URL):

```bash
npx qrcode -o docs/images/companion-apk-qr.png -t png -w 360 -e H -q 2 "https://reachpanel-companion.vercel.app/"
```
