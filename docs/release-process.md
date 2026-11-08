# Releasing ReachPanel

## `dev` → `main` promotion PRs

- Promotion only: include PRs already reviewed on `dev`. No new features, no style sweeps, no direct-to-`dev` commits after the promotion PR opens except fixes for its own CI or review (each fix = its own PR into `dev`).
- One feature or fix per PR into `dev`; formatting or rename sweeps are always their own `chore` PR.
- Do not batch unrelated work behind a single promotion; promote separately so each change can be reverted alone.
- Manual-check evidence (screenshots, log lines) belongs on the promotion PR before merge; re-verify the test plan on the final head after every push.

## Windows desktop

- Bundle targets: `nsis` and `msi` only (`src-tauri/tauri.conf.json`).
- Owner merges `dev` → `main` when CI and manual gates are satisfied.

## Companion (Android)

- `release-android.yml` runs on pushes to `main` when any of these paths change:
  - `companion/**`
  - `docs/install/**`
  - `.github/workflows/release-android.yml`
  - `.github/workflows/deploy-install-site.yml`
- Version bumps use conventional commits under `companion/` since the last `companion-v*` tag.
- Companion bump logic is covered by `companion/scripts/bump-version.test.mjs` via `npm run test:blob` in CI.
- Blob serves only the stable `ReachPanel-Companion.apk`; versioned APKs belong on GitHub Releases.
- After publish, `release-android.yml` deletes leftover `ReachPanel-Companion-<semver>.apk` blobs (`--previous-version` + `--sweep`).
- One-time/manual sweep (dry-run first; needs `BLOB_READ_WRITE_TOKEN`):
  `node scripts/cleanup-old-apk-blobs.mjs --sweep --dry-run`
  then the same command without `--dry-run`.
- The first Companion release after this lands also runs that sweep automatically.
