# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :white_check_mark: |

## Known upstream dependency alerts

### `glib` (RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g)

Dependabot may report a medium-severity alert for `glib` in `src-tauri/Cargo.lock`.

This crate is a **transitive Linux-only dependency** pulled in by Tauri’s GTK/WebKit stack (`gtk` 0.18 → `glib` 0.18). It is not used by the Windows build path, which is the primary distribution target for this project.

Patched versions require `glib` ≥ 0.20, but the unmaintained GTK3 bindings used by Tauri 2 still require `glib` 0.18. There is no safe in-repo version bump until Tauri upstream migrates that stack ([tauri#12048](https://github.com/tauri-apps/tauri/issues/12048)).

We track Tauri releases for a proper fix and dismiss this alert as an accepted upstream risk until then.

### `image-size` (GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq)

Dependabot may report high-severity alerts for `image-size` in `companion/package-lock.json`.

This package is a **transitive Metro/Expo bundler dependency**. Advisories claim a fix in `>= 2.0.3`, but **no such version has been published** to npm (`latest` is still `2.0.2`, which is inside the vulnerable range). `npm audit fix --force` would also try to install Expo SDK 53, which is a breaking change from this project’s SDK 57.

There is no safe in-repo version bump until `image-size` publishes a patched release. The DoS requires feeding a crafted image buffer to Metro’s image-size parser (dev/bundler path), not the Windows desktop runtime.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them through [GitHub Security Advisories](https://github.com/pountzas/reach-Panel/security/advisories/new) (preferred) or contact the maintainers privately.

Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

We will acknowledge receipt within a reasonable timeframe and work on a fix before public disclosure when appropriate.
