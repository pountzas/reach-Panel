# ReachPanel — current UI screen inventory (baseline)

- **Source:** `origin/main` @ `5e06f26`, **v0.19.3**. Main moved from 0.19.2 to 0.19.3 after these notes were written. `origin/dev` @ `82cff05` has **no visible UI differences**; it adds only CI, security scanning, lockfiles and Dependabot changes.
- **Rendered:** 2026-11-25 (Europe/Athens).
- **Method:** The real React components ran in headless Chrome at 2x, with Tauri IPC mocked and the store driven for each state. The companion ran under react-native-web, with Expo modules stubbed and a mock WebSocket client. Rendering used an offline harness (not in this repo) against a read-only export of `origin/main`; the repo itself was untouched.
- **Files:** Each PNG (`png/`) has a static HTML snapshot with CSS inlined (`html/`). The Paper-ready version (`paper_html/*.json`) has inline styles and absolute layers, with no Tailwind classes.
- **Strings:** English from `src/i18n/en.ts`. Companion strings are hard-coded English (the companion has no i18n).
- **Skipped hidden v1 features:** mouse panel, trackpad, numpad and mouse settings (`V1_HIDDEN_FEATURES.mouse`).

**Counts:** host **61** states, companion **22** states, **83 PNGs** in total.
- Host breakdown: Standard, Focus, Mic and FAB 29, Teaching 14, Settings 18.
- Host source paths are relative to `src/components/` unless they start with `src/`.
- Companion paths are relative to `companion/src/`.

## Host (Windows, Tauri window)
| ID | Screen / state | Window | Source files | Notes |
|---|---|---|---|---|
| H01 | Standard — keyboard idle | 1920×520 | layout/AppShell.tsx, layout/SectionCanvas.tsx, layout/DockedSection.tsx, keyboard/KeyboardSection.tsx, keyboard/Keyboard.tsx, keyboard/KeyButton.tsx, keyboard/InputPreview.tsx | Dark grey profile, no text field focused, empty preview frame, mic key disabled (white) |
| H02 | Standard — typing, live preview + suggestions | 1920×520 | + keyboard/PreviewSuggestionsRow.tsx, common/SuggestionsBar.tsx, src/lib/inputPreviewFrames.ts | Text field focused, caret strip, prefix `th`, 7 chips, mic armed (blue) |
| H03 | Standard — preview waiting | 1920×520 | keyboard/InputPreview.tsx | `Waiting for preview…` |
| H04 | Standard — preview unavailable | 1920×520 | keyboard/InputPreview.tsx | Panel occluded → `Preview unavailable` |
| H05 | Standard — sticky Shift + Ctrl | 1920×520 | src/hooks/useStickyModifiers.ts, src/index.css `.sticky-active` | Shifted labels, blue inset ring on latched modifiers |
| H06 | Standard — Fn latched | 1920×520 | keyboard/Keyboard.tsx (fnKeyMode) | Number row shows F1–F12 |
| H07 | Standard — Greek layout | 1920×520 | src/lib/keyboardLayouts.ts, keyboard/LanguageSwitchLabel.tsx | Greek labels, GR flag |
| H08 | Standard — German QWERTZ | 1920×520 | src/lib/keyboardLayouts.ts | QWERTZ, DE flag |
| H09 | Standard — language picker open | 1920×520 | keyboard/LanguagePicker.tsx | Installed Windows input methods |
| H10 | Standard — Light grey profile | 1920×520 | src/lib/colorProfiles.ts | Light grey preset, typing state |
| H11 | Standard — Custom colours | 1920×520 | settings/AppearanceSection.tsx | Example custom palette |
| H12 | Standard — compact input area | 1920×520 | layout/InputAreaViewButtons.tsx | `inputAreaCompact` |
| H13 | Standard — keyboard font 29px | 1920×520 | src/lib/keyboardFontSize.ts | Max font size |
| H14 | Standard — toast: select a text field | 1920×520 | common/AppToaster.tsx, src/lib/dictationErrors.ts | PC mic with no text field |
| H15 | Standard — sticky speech error banner | 1920×520 | common/ErrorBanner.tsx, src/lib/speechPrivacy.ts | GROQ_KEY banner |
| H16 | Standard — update prompt | 1920×520 | common/UpdatePrompt.tsx | 0.19.3 → 0.20.0 |
| H20 | Collapsed FAB (Standard collapsed) | 82×82 | layout/CollapsedFab.tsx | Single brand FAB |
| H21 | Standard collapsed — mode menu | 302×354 | layout/ModeMenu.tsx, src/stores/slices/focusModeSlice.ts | Show keyboard, Standard ✓, Focus, Mic, Teaching, Companion (disabled), Close app |
| H22 | Focus — FAB stack | 82×150 | layout/FocusModeShell.tsx, layout/CollapsedFab.tsx | Settings gear + brand FAB |
| H23 | Focus — mode menu | 302×354 | layout/ModeMenu.tsx | Focus ✓ |
| H24 | Mic — FAB stack, disabled | 82×218 | layout/CollapsedFab.tsx, src/lib/focusMode.ts | Mic FAB white (no text field) |
| H25 | Mic — FAB stack, armed | 82×218 | layout/CollapsedFab.tsx | Mic icon #7dd3fc |
| H26 | Mic — mode menu | 302×354 | layout/ModeMenu.tsx | Mic ✓ |
| H27 | Companion session — host FAB | 82×82 | src/stores/slices/companionSlice.ts | Host minimized while tablet is live |
| H28 | Companion session — host mode menu | 302×354 | layout/ModeMenu.tsx | Companion ✓ |
| H30 | Focus — keyboard shown | 1920×437 | layout/FocusModeShell.tsx | Preview + suggestions |
| H31 | Focus — transparent keys, white | 1920×437 | src/lib/focusMode.ts | On sample wallpaper |
| H32 | Focus — transparent keys, dark grey | 1920×437 | src/lib/focusMode.ts |  |
| H33 | Focus — transparent keys, silver | 1920×437 | src/lib/focusMode.ts |  |
| T01 | Teaching · Language · Spelling — idle | 1920×1040 | teaching/TeachingSubjectShell.tsx, TeachingSubjectTabs.tsx, LanguageLessonPanel.tsx, layout/TeachingKeyboardHeaderControls.tsx | Greek / Primary (9–11), `Press Play to start spelling` |
| T02 | Spelling — playing | 1920×1040 | teaching/LanguageLessonPanel.tsx, src/stores/slices/spellingSlice.ts | Word strip, answer field, Greek keyboard |
| T03 | Spelling — incorrect | 1920×1040 | teaching/LanguageLessonPanel.tsx | `Not quite — try again` |
| T04 | Spelling — new word list form | 1920×1040 | teaching/NewLanguageListForm.tsx |  |
| T05 | Free write — empty | 1920×1040 | teaching/FreeWritePanel.tsx, FreeWriteNotepad.tsx, FreeWritePdfPane.tsx |  |
| T06 | Free write — notes + PDF | 1920×1040 | teaching/FreeWritePdfPane.tsx (pdfjs) | Sample worksheet PDF |
| T07 | Free write — PDF pen tool | 1920×1040 | teaching/FreeWritePdfAnnotationOverlay.tsx |  |
| T08 | Free write — Export PDF dialog | 1920×1040 | teaching/FreeWritePdfExportDialog.tsx |  |
| T09 | Music — idle | 1920×1040 | music/MusicLessonPanel.tsx, music/PartitureView.tsx, keyboard/Synthesizer.tsx, PianoRangeControl.tsx, OctaveCountSwitch.tsx, SynthVolumeControl.tsx | Twinkle Twinkle, 2 octaves |
| T10 | Music — playing | 1920×1040 | src/stores/slices/pianoSlice.ts | Note 6/42 active |
| T11 | Music — 4 octaves | 1920×1040 | src/lib/music/octaveCount.ts |  |
| T12 | Math — coming soon | 1920×1040 | teaching/MathLessonPanel.tsx |  |
| T13 | Teaching — keyboard minimized | 1920×1040 | src/lib/teaching/teachingKeyboardMinimize.ts |  |
| T14 | Free write — clear notepad confirm | 1920×1040 | common/ConfirmDialog.tsx |  |
| S00 | Settings window — top | 900×700 | settings/SettingsPanel.tsx, common/ToolWindowHeader.tsx, src/lib/toolWindows.ts | Always-on-top tool window |
| S99 | Settings — full scroll | 900×4009 | settings/*.tsx | All 11 sections in one board |
| S01 | Settings · Modes | 860-wide section | settings/ModesSection.tsx |  |
| S02 | Settings · Profile | section | settings/ProfileSection.tsx |  |
| S03 | Settings · Accessibility screen | section | settings/AccessibilityMonitorSection.tsx |  |
| S04 | Settings · Taskbar | section | settings/TaskbarSection.tsx |  |
| S05 | Settings · Appearance | section | settings/AppearanceSection.tsx |  |
| S06 | Settings · Visible sections | section | settings/VisibleSectionsSection.tsx, settingsControls.tsx | Word packs |
| S07 | Settings · Keyboard | section | settings/KeyboardSettingsSection.tsx | Fn mode, Groq key |
| S08 | Settings · General | section | settings/GeneralSettingsSection.tsx |  |
| S09 | Settings · Companion (stopped) | section | settings/CompanionSection.tsx |  |
| S10 | Settings · Tools & maintenance | section | settings/ToolsMaintenanceSection.tsx |  |
| S11 | Settings · About | section | settings/AboutSection.tsx |  |
| S12 | Settings · Appearance — Custom | section | settings/AppearanceSection.tsx | Colour pickers |
| S13 | Settings · Companion — bridge running | section | settings/CompanionSection.tsx | QR, JSON, USB steps, devices |
| S14 | Settings · Companion — tablet live | section | settings/CompanionSection.tsx |  |
| S15 | Settings — Light grey | 900×700 |  |  |
| S16 | Settings — Send logs dialog | 900×700 | settings/SendLogsDialog.tsx |  |

## Companion (Android tablet, Expo)
| ID | Screen / state | Window | Source files | Notes |
|---|---|---|---|---|
| C01 | Phone blocked | 800×360 | screens/PhoneBlockedScreen.tsx, tabletGate.ts |  |
| C02 | Pair — camera permission | 1280×800 | screens/PairScreen.tsx |  |
| C03 | Pair — camera scanning | 1280×800 | screens/PairScreen.tsx | Viewfinder placeholder |
| C04 | Pair — busy | 1280×800 | screens/PairScreen.tsx |  |
| C05 | Pair — error | 1280×800 | screens/PairScreen.tsx |  |
| C06 | Pair — USB tether checklist | 1280×800 | components/UsbChecklist.tsx |  |
| C10 | Keyboard — waiting for preview | 1280×800 | screens/ConnectedScreen.tsx, components/KeyboardPanel.tsx, InputPreview.tsx, SuggestionsBar.tsx |  |
| C11 | Keyboard — preview + suggestions | 1280×800 | lib/previewDataUrl.ts |  |
| C12 | Keyboard — language picker sheet | 1280×800 | components/LanguagePickerModal.tsx |  |
| C13 | Keyboard — reconnecting banner | 1280×800 | components/ReconnectingBanner.tsx |  |
| C14 | Keyboard — prediction off | 1280×800 | components/SuggestionsBar.tsx |  |
| C20 | Trackpad | 1280×800 | components/TrackpadPanel.tsx |  |
| C21 | Numpad | 1280×800 | components/NumpadPanel.tsx |  |
| C22 | Dictation — idle | 1280×800 | components/DictationPanel.tsx |  |
| C23 | Dictation — listening | 1280×800 | components/DictationPanel.tsx |  |
| C24 | Dictation — processing | 1280×800 | components/DictationPanel.tsx |  |
| C25 | Dictation — typed result | 1280×800 | components/DictationPanel.tsx |  |
| C26 | Dictation — error (no Groq key) | 1280×800 | components/DictationPanel.tsx |  |
| C27 | Profile sync | 1280×800 | components/ProfilePanel.tsx, hooks/useProfileSnapshot.ts |  |
| C28 | USB tab | 1280×800 | components/UsbChecklist.tsx |  |
| C30 | Collapsed FAB | 1280×800 | components/CollapsedFab.tsx |  |
| C31 | FAB menu open | 1280×800 | components/CollapsedFab.tsx |  |

## Window and canvas sizes
See `tokens.md` §7.
- The reference display is a 1920×1080 accessibility monitor with a 1920×1040 work area.
- Standard mode is 50% of the work area height (2 monitors).
- Focus mode is 42% of the full monitor height.
- Teaching mode fills the full work area.
- FAB windows are 82px wide, plus 220px when the mode menu is open.
- The Settings window is 900×700.
- The companion is a 1280×800 dp landscape tablet.

## Not reproduced faithfully / caveats
- **Font:** I rendered with Selawik, Microsoft's open, metric-compatible fallback for Segoe UI, so glyphs differ slightly from real Segoe UI. The companion uses Roboto, which is right for Android.
- **Windows:** The windows are undecorated, so there's no chrome to draw. Real window opacity (0.95 by default) and the desktop behind the window are not composited. The transparent Focus boards (H31–H33) sit on a sample wallpaper.
- **Live input preview:** The frames are synthetic, a drawn text field, because Windows Graphics Capture isn't available offline.
- **Companion camera:** The viewfinder in C03–C05 is a placeholder box. react-native-web layout can differ slightly from native Android in font metrics and the spinner.
- **Not captured:** OS dialogs (`window.confirm` for wipe profile, file pickers, Windows Voice typing via Win+H) and hover tooltips.
- **Sample data:** example profiles, monitors, paired devices, the worksheet PDF, the pairing payload (and its QR) and the suggestions.
- **README screenshots:** `docs/images/keyboard.png`, `settings.png` and `trackpad.png` are **not** the real app. They are "AccessKey Keyboard / Accessibility Keyboard" mock-ups, so I didn't use them as references, and it's worth replacing them with these renders.
- **Settings crops:** S01–S14 are crops from one tall render, so their HTML snapshots contain the whole Settings page.
- **Brand FAB:** Design notes call it the "**R** logo", but the code renders the app icon (keyboard plus speech glyph) on a #121820 disc.