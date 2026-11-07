# Diagnostics backend (Nikos)

This folder is source only. It is not deployed from CI. Create a **dedicated Free EU** Supabase project for diagnostics — not the future accounts/tier backend.

Function tests run in CI (`check` job in `.github/workflows/build.yml`); run locally with `deno test supabase/functions/`.

The service role stays in Supabase’s secret store. Edge Functions receive it as an environment variable. Do **not** put it in this repo, in GitHub Actions secrets, in docs examples, or in the app binary. GitHub only gets `REACH_SUPABASE_URL` and `REACH_SUPABASE_ANON_KEY`.

## 1. Create the project

1. New project on the Free plan, **EU** region, name e.g. `reach-panel-diagnostics`.
2. Do not reuse an accounts/auth project.

## 2. Apply the schema

From this repo (after `supabase login` and `supabase link --project-ref <ref>`):

```powershell
supabase db push
```

That creates:

- Private bucket `diagnostics` (public access off, 5 MB object cap)
- Table `public.diagnostic_reports` with RLS enabled and **no** client policies
- No storage RLS policies for `anon` or `authenticated`

Confirm in the dashboard: Storage → `diagnostics` → Public is off. Authentication → Policies: no grants on `diagnostic_reports` or `storage.objects` for `anon` / `authenticated`.

## 3. Deploy the functions

```powershell
supabase functions deploy submit-diagnostics
supabase functions deploy cleanup-diagnostics
```

JWT verification stays **on** (`verify_jwt = true` in `config.toml`). Callers need the anon key as `Authorization: Bearer <anon>`. Cleanup is called with the service role JWT from Vault / pg_cron, never from the app.

## 4. Schedule 30-day cleanup

Deleting `storage.objects` rows in SQL does **not** delete files. `cleanup-diagnostics` removes objects through the Storage API, then deletes the table rows.

Enable **pg_cron** and **pg_net**. Put the project URL and service JWT in Vault (or database settings), then schedule a daily POST. Example (replace the URL; do not commit the JWT):

```sql
select cron.schedule(
  'cleanup-diagnostics-daily',
  '15 4 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/cleanup-diagnostics',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || '<service-role-jwt-from-vault>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Retention is 30 days.

The per-install limits use the client-supplied `x-install-id` hash. A script that rotates that header can spend the project-wide 100 reports/day cap and then block real uploads until the next day. The cap is the backstop; it is not proof of one install.

## 5. GitHub secrets for the app (anon only)

In the GitHub repo: Settings → Secrets and variables → Actions. Add:

- `REACH_SUPABASE_URL` — `https://<project-ref>.supabase.co`
- `REACH_SUPABASE_ANON_KEY` — the project’s legacy anon JWT (starts with `eyJ`). Do not use the `sb_publishable_…` key while `verify_jwt = true`. Those keys are not JWTs. Current Supabase docs say the gateway may accept them on `Authorization` without authenticating the caller, so the JWT check would not be doing its job. Ship the legacy anon JWT until the function authorizes publishable keys itself.

These are passed into `npm run build:tauri:release`. A missing secret must **not** fail the release; the Send logs button stays hidden. Never add the service role key here.

The keep-alive workflow (`.github/workflows/supabase-keepalive.yml`) uses the same two secrets. Enable it on `main` when the project exists; do not run it until then. It GETs `submit-diagnostics` every 3 days so the Free project does not pause.

## 6. Local app testing

Copy `.env.example` values into your shell before `cargo` / `tauri` so `option_env!` sees them. Dev builds without those variables hide Send logs and still run.

## Ping

`GET {SUPABASE_URL}/functions/v1/submit-diagnostics` with the anon key runs a cheap `select` on `diagnostic_reports` and returns `{ ok: true }` without writing.
