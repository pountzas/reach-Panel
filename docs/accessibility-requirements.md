# Accessibility Requirements

## Who it's for

ReachPanel is for people who cannot use a physical keyboard and need touch-first control of a Windows PC. It was originally built for a child with complete tetraplegia so he can do schoolwork on a touch-capable laptop.

Typical needs:

- Large keys, simple navigation, and emergency phrases
- Good use of head, eye, and pointing-finger movement on a touchscreen
- Single touch laptop at school, or a secondary touch display at distance when available

Caregivers can manage named profiles, emergency phrase visibility, monitor selection, and head-tracking calibration in Settings.

## Layout Wireframes

### Layout A (default — mouse right)
```
+---------------------------------------------------+
| Quick Actions                                     |
+---------------------------------------------------+
| Keyboard                              | Mouse     |
+---------------------------------------------------+
| Suggestions                                       |
+---------------------------------------------------+
```

### Layout B (mouse left)
```
+---------------------------------------------------+
| Quick Actions                                     |
+---------------------------------------------------+
| Mouse                                 | Keyboard  |
+---------------------------------------------------+
| Suggestions                                       |
+---------------------------------------------------+
```

## Acceptance Criteria

| Feature | Criteria |
|---------|----------|
| Keyboard injection | Types into Notepad, Chrome, Word, Teams, Explorer |
| Sticky keys | Ctrl stays active until next key or toggle off |
| Mouse trackpad | Move, click, scroll from the accessibility touchscreen |
| Mouse placement | Right or left next to the keyboard; persisted per profile |
| Quick actions | Launch exe and URL targets |
| Phrases | Type, speak, or both; favorites and emergency toggle |
| TTS | Offline via Windows SAPI installed voices |
| Prediction | Offline word packs (English bundled; other languages downloadable); learn on typed words; disable toggle |
| Macros | Multi-step sequences; JSON import/export |
| Head tracking | Calibration wizard; touch/head mode toggle |
| Multi-monitor | List displays; position app on accessibility screen |
| Profiles | Named saved profiles with separate settings |

## Known Limitations

- Input injection does not work into elevated (admin) applications or UAC prompts
- Eye tracking, AutoHotkey import, and an Android tablet companion (connects to this Windows app to control the PC) are future phases
