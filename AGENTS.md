# Agent notes

## Debugging / logs

Logs live in `%LOCALAPPDATA%\com.nik.reach-panel\logs\` (`reach-panel.log*`, `breadcrumbs.log`, `crash-*.txt`, `session.json`). Details: [docs/logging.md](docs/logging.md).

```powershell
Get-Content "$env:LOCALAPPDATA\com.nik.reach-panel\logs\reach-panel.log" -Tail 300
rg "previous session ended uncleanly|panic thread=" "$env:LOCALAPPDATA\com.nik.reach-panel\logs"
```

After a silent exit, read `session.json` and `breadcrumbs.log` first, then the current log tail.

Never add log calls that include typed or dictated text, typed buffers, transcripts, clipboard, settings JSON content, or keys (`gsk_…` and similar).
