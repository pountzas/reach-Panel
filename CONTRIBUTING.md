# Contributing

Thank you for helping improve Accessibility Keyboard.

## Prerequisites

- Windows 10 or 11
- Node.js 18+
- Rust (via [rustup](https://rustup.rs/))
- Visual Studio Build Tools with the C++ workload

## Getting started

```bash
git clone https://github.com/pountzas/accessibility-keyboard.git
cd accessibility-keyboard
npm install
npm run tauri dev
```

If `link.exe` is not found, run from a Developer Command Prompt or activate the MSVC environment first.

## Branch model

| Branch | Purpose |
|--------|---------|
| `dev` | Integration branch for day-to-day work |
| `main` | Production line; releases are cut from here |
| `feature/*` | Short-lived branches for individual changes |

Typical flow: `feature/*` → PR into `dev` → when ready to ship, PR `dev` → `main`.

The **Build** workflow runs on pull requests from `dev` into `main`. Releases are automated on `main` only (see below).

## Building the Tauri app

| Command | When to use |
|---------|-------------|
| `npm run build:tauri` | Local smoke tests, CI PR validation — produces installers **without** signed updater artifacts |
| `npm run build:tauri:release` | Release builds only — produces signed updater artifacts (requires signing env vars below) |

The default [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) sets `createUpdaterArtifacts: false` so ordinary builds never require a signing key. Release builds merge [`src-tauri/tauri.release.conf.json`](src-tauri/tauri.release.conf.json), which re-enables updater artifacts for signed releases.

## Updater signing (maintainers)

The in-app updater verifies release bundles with a minisign key pair. The **public** key lives in `tauri.conf.json` (`plugins.updater.pubkey`). The **private** key must never be committed — store it only in GitHub Actions secrets.

### One-time key generation

If you do not already have a matching private key for the pubkey in the repo:

```bash
npm run tauri signer generate -w ~/.tauri/accessibility-keyboard.key
```

Copy the printed public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` (only if generating a new pair). Add these **repository secrets** under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Entire contents of the `.key` file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password, or leave unset / empty if none was set |

The Release workflow validates that `TAURI_SIGNING_PRIVATE_KEY` exists before building. If release builds fail with a signing error, the private key is missing, wrong, or does not match the pubkey in config.

### Local signed release build (optional)

```bash
# PowerShell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$HOME\.tauri\accessibility-keyboard.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # omit if no password
npm run build:tauri:release
```

## Pull request workflow

1. Fork the repository and create a branch from `dev`.
2. Make your changes with a focused scope — one feature or fix per PR when possible.
3. Run `npm run tauri dev` and manually verify the affected behavior.
4. Update documentation if user-facing behavior changes.
5. Open a pull request into `dev` with a clear description of what changed and why.
6. Use a [Conventional Commits](https://www.conventionalcommits.org/) **PR title** when squash-merging (e.g. `feat: add preset`, `fix: trackpad drift`).

### Conventional commits and versioning

Release-please reads commit messages on `main` to choose the next semver:

| Prefix | Version bump |
|--------|----------------|
| `fix:` | patch (0.1.0 → 0.1.1) |
| `feat:` | minor (0.1.0 → 0.2.0) |
| `BREAKING CHANGE:` in body, or `feat!:` / `fix!:` | major |
| `chore:`, `docs:`, `ci:` | no user-facing release |

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please). No manual version tags are required.

1. Merge `dev` into `main` via pull request.
2. Release-please opens or updates a **Release PR** on `main` (e.g. `chore(main): release 0.1.1`) that bumps version files and `CHANGELOG.md`.
3. Merge the Release PR. GitHub Actions builds Windows `.exe`/`.msi` and macOS `.dmg` bundles and attaches them to the [Releases](https://github.com/pountzas/accessibility-keyboard/releases) page.

Version is kept in sync across `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.

## One-time repository setup

After cloning or forking, maintainers should ensure:

1. A `dev` branch exists on the remote (create from `main` if missing): `git checkout -b dev && git push -u origin dev`
2. The latest release tag exists on `main` (e.g. `v0.1.0`) and matches `.release-please-manifest.json`
3. **Settings → Actions → General:** enable **Allow GitHub Actions to create and approve pull requests** (required for release-please)
4. **Settings → Secrets and variables → Actions:** configure `TAURI_SIGNING_PRIVATE_KEY` (and password if used) — see [Updater signing](#updater-signing-maintainers)
5. If `main` is branch-protected, allow `github-actions[bot]` to push and merge Release PRs

## Accessibility changes

Changes that affect usability for people with motor disabilities should align with [docs/accessibility-requirements.md](docs/accessibility-requirements.md). Mention which persona (Child, Adult, Therapist) is affected in your PR description.

## Code style

- Match existing patterns in the React frontend and Rust backend.
- Avoid introducing new frameworks or large refactors unless discussed in an issue first.
- Keep changes minimal and focused on the problem being solved.

## Reporting issues

Use the GitHub issue templates for bugs and feature requests. Include your Windows version, steps to reproduce, and screenshots when relevant.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful and constructive in all interactions.
