# Accessibility Requirements

## Who it's for

ReachPanel is for people who cannot use a physical keyboard and need touch-first control of a Windows PC. It was originally built for a child with complete tetraplegia so he can do schoolwork on a touch-capable laptop.

Typical needs:

- Large keys, simple navigation, and clear mode switching (Normal / Mini / Teaching)
- Good use of pointing-finger movement on a touchscreen (host keyboard or Android companion trackpad)
- Single touch laptop at school, or a secondary touch display at distance when available
- Optional Android tablet companion for remote keyboard, trackpad, numpad, and dictation

Caregivers can manage named profiles, monitor selection, companion pairing, and dictation keys in Settings.

## Layout Wireframes

### Normal mode (default)

```
+---------------------------------------------------+
| Keyboard                                          |
+---------------------------------------------------+
| Suggestions                                       |
+---------------------------------------------------+
```

### Mini mode

```
+---------------------------------------------------+
| Compact keyboard + suggestions (when expanded)    |
+---------------------------------------------------+
| (Collapsed: branded FAB)                          |
```

### Teaching mode

```
+---------------------------------------------------+
| Lesson panel (Language / Music / Mathematics)     |
+---------------------------------------------------+
| Piano / synthesizer (Music)                       |
+---------------------------------------------------+
```

Fullscreen work area on the accessibility monitor. Math and Language slots are placeholders.

### Android companion (pointer + remote typing)

Tablet tabs while connected: keyboard, trackpad, numpad, dictation, profile, USB help. Host injects into the focused Windows app over the local WebSocket bridge.

## Acceptance Criteria

| Feature | Criteria |
|---------|----------|
| Keyboard injection | Types into Notepad, Chrome, Word, Teams, Explorer |
| Sticky keys | Ctrl stays active until next key or toggle off |
| Prediction | Offline word packs (English bundled; other languages downloadable); learn on typed words; disable toggle |
| Dictation | Dictate key beside Right Ctrl; WinRT for EN/DE/FR/IT/ES/PT; Groq for Greek and unsupported packs |
| Multi-monitor | List displays; position app on accessibility screen |
| Profiles | Named saved profiles with separate settings |
| Mini Mode | Compact keyboard; collapse to FAB; optional transparent outlined keys; Teaching never hosts Mini |
| Teaching | Full work area; Music lesson + synth; Language/Math placeholders; leave Teaching restores prior Normal/Mini size |
| Companion | Pair Android tablet via Settings QR or USB tether; tablet keyboard/trackpad/numpad/dictation/suggestions; host-only SendInput |
| Updates | In-app update check surfaces failures and can install from Releases |

## Known Limitations

- Input injection does not work into elevated (admin) applications or UAC prompts
- Eye tracking and AutoHotkey import remain future phases
- Host Windows chrome for mouse panel, phrases, Quick Actions, macros, and head tracking is gated off for v1 and planned for removal; companion keeps trackpad/numpad
- **Tablet companion (shipped):** Android-first Expo app in `companion/` pairs over local Wi‑Fi or USB tether to `src-tauri/src/companion/`; tablet owns mic while connected; host-only injection. Design: `docs/superpowers/specs/2026-08-05-tablet-companion-design.md`
