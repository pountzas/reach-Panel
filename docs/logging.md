# Logging

ReachPanel writes rotating logs, a session marker, breadcrumbs, and panic sidecars next to each other so a caregiver or agent can diagnose a crash without a log viewer in the app.

## Location

```
%LOCALAPPDATA%\com.nik.reach-panel\logs\
```

Typical expansion: `C:\Users\<you>\AppData\Local\com.nik.reach-panel\logs\`.

Settings → Tools & maintenance has **Open logs folder** and **Copy diagnostics**. Copy diagnostics puts a report on the clipboard (version, Windows build, WebView2, log path, previous-session status, last 200 redacted log lines). It does not upload anything.

## Files

| File | What it is |
| --- | --- |
| `reach-panel.log*` | Rotating app log. Up to **5** files, **2 MB** each (`RotationStrategy::KeepSome(5)`, `max_file_size` 2_000_000). |
| `breadcrumbs.log` | Last 200 layout/window breadcrumbs (atomic rewrite). |
| `crash-*.txt` | Panic sidecars (`crash-YYYYMMDDTHHMMSS.sssZ.txt`). **Not** rotated with the log. Startup keeps the newest **10** and leaves log / breadcrumb / session files alone. |
| `session.json` | Current-session marker (`pid`, `started_at`, `version`, `clean_exit`, optional `reason`). |

## Line format and levels

`tauri-plugin-log` lines look like:

```
[2026-11-03][22:15:01][reach_panel_lib::diagnostics][INFO] session start version=0.17.5 ...
```

- Timezone: local
- Default level: **Info**
- **Debug** for target `reach_panel_lib` in debug builds only
- Webview log target: debug builds only

Frontend lines go through `src/lib/log.ts` and include a window label, for example `[main] about: Failed to load app version`.

## Previous session ended uncleanly

On startup the app reads `session.json` before rewriting it:

- **missing** — first run, or the marker was deleted
- **corrupt** — file present but not valid JSON
- **clean** — previous process set `clean_exit: true` on a normal shutdown
- **unclean** — previous process died with `clean_exit: false` (panic, kill, crash)

An unclean or corrupt previous session logs:

```
previous session ended uncleanly: reason=..., started_at=..., last_breadcrumb=...
```

`reason` is `panic` when the panic hook ran, otherwise `unknown`. `last_breadcrumb` is the last non-empty line of `breadcrumbs.log`, falling back to the last line of `reach-panel.log`.

After that line, `session.json` belongs to the **new** session (`clean_exit: false` until a clean shutdown). For a silent exit, read `session.json` and `breadcrumbs.log` first, then the warning line in `reach-panel.log`.

## Privacy

Never log typed or dictated text, typed buffers, suggestion words, transcripts, clipboard contents, Groq or API keys, the full `settings_json`, or companion pairing secrets. Lengths, counts, ids, and enum states are fine.

`gsk_…` tokens are redacted to `gsk_***` in the Rust and frontend log helpers and in the diagnostics report tail.

Copy diagnostics does not include typed/dictated text, buffers, transcripts, clipboard, settings JSON, or keys beyond that redaction.

## Optional: Windows Error Reporting minidumps

Panic sidecars cover Rust panics. Native (non-panic) process kills can still produce minidumps if you opt into WER **LocalDumps**. This is optional and off by default.

In an elevated PowerShell:

```powershell
$exe = "ReachPanel.exe"
$key = "HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\$exe"
New-Item -Path $key -Force | Out-Null
New-ItemProperty -Path $key -Name DumpFolder -PropertyType ExpandString -Value "%LOCALAPPDATA%\com.nik.reach-panel\dumps" -Force
New-ItemProperty -Path $key -Name DumpType -PropertyType DWord -Value 1 -Force
New-ItemProperty -Path $key -Name DumpCount -PropertyType DWord -Value 5 -Force
```

`DumpType` `1` is a minidump; `2` is a full dump. Dumps can contain process memory — treat the folder as sensitive. ReachPanel does not configure this key itself.
