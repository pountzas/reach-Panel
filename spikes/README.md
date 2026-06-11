# Phase 0 Spikes

Technical validation is implemented in the main Tauri application:

- **Input injection**: `src-tauri/src/input/` — Windows `SendInput` for keyboard and mouse
- **Multi-monitor**: `src-tauri/src/window/` — `EnumDisplayMonitors` API
- **Mouse control**: `src-tauri/src/input/mouse.rs` — cursor move, click, scroll

Run `npm run tauri dev`, open Notepad on the laptop display, and type from the virtual keyboard on the app window to validate end-to-end injection.
