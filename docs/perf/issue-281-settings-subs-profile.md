# Issue #281 — settings subscription / KeyButton profile notes

Measured with React `Profiler` in Vitest (jsdom) on `epic-282-performance` @ `0a01541` (after #278).

Harnesses:

- `src/components/keyboard/KeyButton.perf.test.tsx` — 80 keys, sticky Shift, 20 strokes
- `src/components/settings/settingsSubscription.perf.test.tsx` — one unrelated `mouseSpeed` write

## Scenario A — type ~20 chars with sticky Shift

| Metric | Before (inline handlers, no memo) | After (`memo(KeyButton)` + stable `KeyboardKey` handlers) |
| --- | ---: | ---: |
| Tree update commits | 20 | 20 |
| `KeyButton` renders | **1600** (80 × 20) | **39** (active-key transitions only) |
| Total `actualDuration` | **405 ms** (~20.3 ms/stroke) | **~118–138 ms** (~6–7 ms/stroke) |

Kept: `memo` on `KeyButton`, `KeyboardKey` with ref-stable `onPress`/`onHoldEnd`, narrow `useShallow` settings slice in `Keyboard`.

## Scenario B — one unrelated settings change (`mouseSpeed`)

Components that previously subscribed to whole `settings`:

| Component | Before commits | After commits |
| --- | ---: | ---: |
| `MathLessonPanel` | 1 | 0 |
| `InputAreaViewButtons` | 1 | 0 |
| `InputPreview` | 1 | 0 |
| `ModeMenu` | 2 | 0 |
| **Sum** | **5** (~5.5 ms) | **0** |

Also narrowed (same pattern, not in the four-component harness): `CollapsedFab`, `FreeWritePanel`.

`FreeWritePdfPane` was not changed (#278 DPR/load work left alone; profile did not require it).

## Out of scope / not kept

No store-shape split, no new state libraries. Components the harness did not flag were left alone.
