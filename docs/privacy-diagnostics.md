# Diagnostic uploads — privacy / Store note (draft)

Not published. The text that will go on the privacy policy and the Microsoft Store listing lives with #297 (privacy policy) and #176 (Store). This file is the wording to paste there later.

## What to publish

ReachPanel can send diagnostic data only after you tap **Send logs**. Nothing is uploaded in the background, at crash time, or on a schedule.

- No account. Free use does not require sign-in.
- The zip has logs, breadcrumbs, recent crash sidecars, `session.json`, and an optional note you typed in the dialog. Typed and dictated text is never logged. API keys and tokens are redacted. Your Windows user name is removed from paths.
- The per-install identifier is sent only as a SHA-256 hash, never the raw id.
- Processor: Supabase, EU region. Kept for 30 days, then deleted (storage objects and database rows).
- Store disclosure: diagnostic data, sent on request.

## What not to say

Do not describe automatic telemetry, crash auto-send, or an account requirement. Do not publish the service role key or dashboard URLs in the public policy.
