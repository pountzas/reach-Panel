-- Private diagnostics bucket. Public access stays off.
-- Do not add storage RLS policies for anon or authenticated: only the
-- Edge Functions, using the service role, read or write objects.
-- Deleting rows in storage.objects does not delete the files; cleanup
-- must go through the Storage API (see cleanup-diagnostics).

insert into storage.buckets (id, name, public, file_size_limit)
values ('diagnostics', 'diagnostics', false, 5242880)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create table if not exists public.diagnostic_reports (
  report_id text primary key,
  install_hash text not null,
  app_version text not null default '',
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists diagnostic_reports_install_created_idx
  on public.diagnostic_reports (install_hash, created_at);

alter table public.diagnostic_reports enable row level security;

-- No policies for anon or authenticated. Service role bypasses RLS.

-- Retention: pg_cron should call the cleanup-diagnostics Edge Function daily.
-- Deleting storage.objects rows in SQL does not remove the files.
-- After enabling pg_cron and pg_net, schedule (service JWT from Vault, never committed):
--
-- select cron.schedule(
--   'cleanup-diagnostics-daily',
--   '15 4 * * *',
--   $$
--   select net.http_post(
--     url := current_setting('app.settings.diagnostics_cleanup_url'),
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.diagnostics_service_jwt'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
