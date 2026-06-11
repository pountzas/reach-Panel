# Contributing

Thank you for helping improve Accessibility Keyboard.

## Prerequisites

- Windows 10 or 11
- Node.js 18+
- Rust (via [rustup](https://rustup.rs/))
- Visual Studio Build Tools with the C++ workload

## Getting started

```bash
git clone https://github.com/nik/accessibility-keyboard.git
cd accessibility-keyboard
npm install
npm run tauri dev
```

If `link.exe` is not found, run from a Developer Command Prompt or activate the MSVC environment first.

## Pull request workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes with a focused scope — one feature or fix per PR when possible.
3. Run `npm run tauri dev` and manually verify the affected behavior.
4. Update documentation if user-facing behavior changes.
5. Open a pull request with a clear description of what changed and why.

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
