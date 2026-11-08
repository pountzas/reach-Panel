# Dictation into the focused field — design

Issue: https://github.com/pountzas/reach-Panel/issues/349  
Comment evidence (0.18.0, report `5RX89TBZ`): overlay bars move, Stop does not hide the overlay, nothing is typed, STT path logs nothing.

## Problem

Mic-mode FAB and the keyboard Mic key share `toggleDictation` → `cmd_start_dictation` → WinRT or Groq. Recognized text is injected with `type_text` after `restore_target_focus`. Failures are silent. The session has no app-owned silence or max-duration stop. Overlay Stop calls `cmd_stop_dictation` with no optimistic hide.

## Decisions

| Item | Value |
| --- | --- |
| No-target copy | `Select a text field to dictate` (same as `en.micModeSelectInput`) |
| Keyboard Mic disabled | `!isMicFabEnabled({ dictationState, canDictate, externalInputFocused })` |
| Transparent disabled Mic key | opacity `0.45`, text `#94a3b8` |
| Overlay Stop event | `dictation-overlay-stop` (overlay emits; main calls `stopDictation()`) |
| WinRT `InitialSilenceTimeout` | 5 s |
| WinRT `EndSilenceTimeout` | 10 s |
| WinRT `AutoStopSilenceTimeout` | 10 s |
| `StopAsync` wait bound | 3 s, then force-close, always emit `Idle` |
| Max session | 60 s, quiet end (not `stt-error`) |
| Logs | `log::info!` / `warn!` / `error!` — engine, language, char counts, statuses. Never text. |
| Mic contention (`overlayShouldCaptureMic`) | Do **not** change in this branch. Confirm H1 from new logs first. |
| Groq VAD threshold | Leave `0.004`. Flush remainder on stop (do not drop buffered speech). |
| Companion dictation | Do not change `src-tauri/src/companion/dictation.rs` except no regression. |
| `src-tauri/src/lib.rs` | Do not restructure. Command registration only if a new command is required (prefer events). |

## User-visible behavior

1. With an external text field focused, FAB and keyboard Mic type recognized text into that field (WinRT and Groq).
2. Without a focused external field, neither control starts dictation. The Mic key is `disabled`, grayed (normal and transparent), aria `micModeSelectInput`.
3. While listening/processing, Mic stays enabled so Stop works even if focus is lost.
4. Injection failure (no target, foreground refused, `SendInput` short) → `stt-error` toast, session stops, overlay hides. No silent drop.
5. Silence timeout and max-session end are not errors (#198).
6. Overlay Stop hides the pill immediately; FAB/key go idle within 500 ms; backend stop is bounded at 3 s.

## Logging (packaged + dev)

- Start: engine + language
- Each final result: char count only
- Non-Success WinRT result / Completed status
- `restore_target_focus` no-op or error reason
- `SetForegroundWindow` failed
- `SendInput` sent ≠ expected
- Stop requested, stop completed (duration), stop timeout
