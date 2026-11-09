# WinRT dictation produces no text (issue 394)

Branch: `pountzas/fix-dictation-producing-no-text-on-winrt-and-gro` (already at `dev` `07a3da4`). PR target later is `dev`. Do not merge. Do not open a PR unless Nikos asks. Groq latency / live words is **#395** — do not change flush timing, VAD thresholds, or add interim Groq results.

## Global Constraints

- Windows only. No `cfg` stubs for other OSes.
- Never log dictated text, transcripts, clipboard, settings JSON, or API keys. Log lengths, durations, byte counts, and status codes only.
- Keep a single insert path: `handle_desktop_result`.
- Overlay must not call `getUserMedia` for WinRT or Groq.
- WinRT must add `SpeechRecognitionTopicConstraint` for the Dictation topic before `CompileConstraintsAsync`. Compile status other than Success still fails start.
- A quiet end (`TimeoutExceeded`, `PauseLimitExceeded`) with zero successful results this session emits a user-visible error, then Idle. `UserCanceled` stays silent.
- User Stop returns the UI to Idle without waiting on a 3s `StopAsync`. Use `CancelAsync`, bound the wait to under 1s, and emit Idle even when cancel times out. Close the recognizer after the wait.
- Info logs: engine, language (WinRT resolved BCP-47 tag at start), Groq WAV bytes / duration when a chunk is posted, WinRT compile or Completed status, transcript char length.
- TDD: failing test first, then minimal code. Use `node $env:USERPROFILE\.cursor\skills\test-driven-development\scripts\tdd-run.mjs`.
- Do not log or store raw speech text in tests as if it were production logging.

## Task 1: Overlay never captures the mic

**Files:** `src/lib/dictationOverlayWindow.ts`, `src/lib/dictationOverlayWindow.test.ts`

Change `overlayShouldCaptureMic` so `"winrt"`, `"groq"`, `undefined`, and `null` all return `false`. Update the existing test that expects `true` for `"winrt"`.

No other overlay behavior.

## Task 2: Dictation topic constraint

**Files:** `src-tauri/src/stt/winrt.rs` (helper + start path)

Add a pure helper, tested without a live recognizer:

```rust
pub(crate) fn dictation_topic_name() -> &'static str { "Dictation" }
```

Test: `dictation_topic_name()` equals `"Dictation"`.

In `start_dictation`, before `CompileConstraintsAsync`:

- `SpeechRecognitionTopicConstraint::Create(SpeechRecognitionScenario::Dictation, &HSTRING::from(dictation_topic_name()))`
- `recognizer.Constraints()?.Append(&constraint)`
- then existing compile; non-Success still returns an error and closes the recognizer.

Import the WinRT types from `windows::Media::SpeechRecognition`. If `Append` needs a different constraint interface, use the crate’s `ISpeechRecognitionConstraint` conversion that this `windows` version actually exports. Do not invent APIs.

## Task 3: Silence with no results

**Files:** `src-tauri/src/stt/winrt.rs`

```rust
pub const NO_SPEECH_RECOGNIZED: &str =
    "No speech recognized. Check the microphone and speak after dictation starts.";

pub(crate) fn silence_without_results_message(
    status_is_timeout_or_pause: bool,
    success_result_count: u32,
) -> Option<&'static str> {
    if status_is_timeout_or_pause && success_result_count == 0 {
        Some(NO_SPEECH_RECOGNIZED)
    } else {
        None
    }
}
```

Tests:

- TimeoutExceeded-equivalent `true` + count 0 → `Some(NO_SPEECH_RECOGNIZED)`
- same + count 1 → `None`
- `false` (user cancel or success) + count 0 → `None`

Track `success_results: u32` on the session runtime (increment only when `ResultGenerated` status is Success, including empty text). On `Completed`, if `is_quiet_end` and the status is TimeoutExceeded or PauseLimitExceeded (not UserCanceled), and the message helper returns Some, `emit_error` that string, then `emit_state` Idle. Do not emit the message for UserCanceled.

## Task 4: Stop under one second

**Files:** `src-tauri/src/stt/timeouts.rs`, `src-tauri/src/stt/winrt.rs`

- Change `STOP_ASYNC` from 3s to 800ms. Update tests that assert 3 seconds (`timeout_values_match_spec`, `duration_to_winrt` if it hardcodes 3s ticks for STOP_ASYNC, `stop_async_timeout_at_three_seconds`).
- `stop_dictation` calls `CancelAsync` instead of `StopAsync`. Log `stt stop completed` / `stt stop failed` / `stt stop timed out` the same way, with `duration_ms`.
- Emit Idle after cleanup even when cancel times out (existing `stop_cleanup_actions` already sets `emit_idle`).

## Task 5: Info log lines and Groq empty audio

**Files:** `src-tauri/src/stt/events.rs` or a small `src-tauri/src/stt/log_lines.rs`, call sites in `stt/mod.rs`, `winrt.rs`, `groq/mod.rs` or `groq/http.rs`.

Pure helpers (tested):

- `start_log_line(engine, language) -> String` format `stt start engine={engine} language={language}` — callers pass the resolved WinRT tag (`en-US`) or Groq hint (`el`), not a transcript.
- `result_log_line(engine, status, transcript_chars) -> String` format `stt result engine={engine} status={status} chars={transcript_chars}`
- `groq_post_log_line(wav_bytes, duration_ms, http_status) -> String` format `stt groq post bytes={wav_bytes} duration_ms={duration_ms} http={http_status}`
- `groq_empty_audio_message(wav_bytes) -> Option<&'static str>` returns `Some("No speech captured. Check the microphone.")` when `wav_bytes == 0`, else `None`.

Wire:

- WinRT start info log includes resolved BCP-47 tag via `start_log_line("winrt", tag)` in addition to any existing start log (do not double-log the same line from both router and engine; if `stt/mod.rs` already logs `stt start engine=winrt language=en`, change that call to pass the resolved tag from the engine only — one info line).
- On WinRT Completed, log status through `result_log_line` when there is no Success text (chars 0). Keep existing `winrt ResultGenerated chars=` for successes.
- Groq: before/after POST, one info line from `groq_post_log_line`. When wav is empty, skip HTTP (already) and `emit_error` the empty-audio message once.

Do not change Groq VAD thresholds or silence flush duration.
