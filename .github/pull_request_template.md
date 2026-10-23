## Summary

<!-- What does this PR change and why? -->

## Promotion hygiene

- [ ] This PR is **one** feature/fix (or a `dev` → `main` promotion of already-reviewed PRs — link them)
- [ ] No formatting-only changes mixed in (style PRs are separate; see Prettier `format:check` on `dev`)
- [ ] Changed files &lt; 100 (if not: split, or state why and request manual review)
- [ ] Test plan was run on the **current head** (re-run after any new push)
- [ ] Manual Windows checks done where the template asks (icons/preview/etc.)

## Commit message

Use a [Conventional Commits](https://www.conventionalcommits.org/) **PR title** (especially when squash-merging), e.g. `feat:`, `fix:`, `chore:`, `docs:`. Release-please uses these on `main` to determine version bumps.

## Related issue

<!-- Link issue if applicable: Fixes #123 -->

## Accessibility impact

<!-- How this affects touch-first / motor-disability users — or N/A for internal changes -->

## Test plan

- [ ] Ran `npm run tauri dev` locally
- [ ] Manually tested the affected feature on Windows
- [ ] Updated docs if user-facing behavior changed

## Screenshots (if UI changed)

<!-- Add before/after screenshots when relevant -->
