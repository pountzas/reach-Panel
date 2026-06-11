# Accessibility Requirements

## Personas

### Child (primary)
- 7-year-old with complete tetraplegia
- Good head, eye, and pointing-finger movement
- Long attention span; comfortable with touchscreen tablets
- Needs large keys, simple navigation, emergency phrases

### Adult
- Full feature set, smaller keys acceptable, macro and layout customization

### Therapist / Caregiver
- Profile management, emergency phrase visibility toggle, monitor selection, calibration

## Layout Wireframes

### Layout A (default)
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

### Layout C (floating mouse)
```
+---------------------------------------------------+
| Quick Actions                                     |
+---------------------------------------------------+
| Keyboard (full width)                             |
+---------------------------------------------------+
| Suggestions                                       |
+---------------------------------------------------+

  +------------------+
  | Floating Mouse   |
  +------------------+
```

## Acceptance Criteria

| Feature | Criteria |
|---------|----------|
| Keyboard injection | Types into Notepad, Chrome, Word, Teams, Explorer |
| Sticky keys | Ctrl stays active until next key or toggle off |
| Mouse trackpad | Move, click, scroll from wheelchair touchscreen |
| Mouse placement | Right, left, floating; persisted per profile |
| Quick actions | Launch exe and URL targets |
| Phrases | Type, speak, or both; favorites and emergency toggle |
| TTS | Offline via Windows SAPI installed voices |
| Prediction | Top suggestions per language; disable toggle |
| Macros | Multi-step sequences; JSON import/export |
| Head tracking | Calibration wizard; touch/head mode toggle |
| Multi-monitor | List displays; position app on accessibility screen |
| Profiles | Child, Parent, Therapist with separate settings |

## Known Limitations

- Input injection does not work into elevated (admin) applications or UAC prompts
- Eye tracking and AutoHotkey import are future phases
