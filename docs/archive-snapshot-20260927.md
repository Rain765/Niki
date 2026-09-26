# Historical Niki source snapshot

This branch is an archival checkpoint, not a release or a proposal to merge into main.

- Captured on 2026-09-27 from the local `Niki-backup-20260729` directory.
- Original Git baseline: `be62c7bfd5bd9ef2d5ec8ee9723c3db1740674a7`.
- Preserves all 94 modified tracked files and 30 untracked source/configuration files found during the audit, including the files that already have matching content in GitHub history. This keeps the old working tree coherent.
- The 124 captured files were compared byte for byte with the source backup. No functional code edits were made while archiving.
- Excludes local databases, environment files, credentials, dependencies, build output, screenshots, and browser records. The original local backup remains unchanged.

## Verification

- The complete staged file set, diff structure, whitespace, and captured-file hashes were checked.
- Credential-pattern scanning of the captured files found only test fixtures; those matches were reviewed in their mock/test context.
- `pnpm guard` passed, including six style-policy tests.
- `pnpm typecheck` was attempted using temporary links to existing local dependencies. It stopped in `packages/contracts/tests/package-runtime.test.ts` because the archive checkout lacks the package's generated export declarations (`@open-design/contracts` and subpaths). No dependency installation or source repair was performed. This is not a successful full typecheck or production acceptance.
- No release, deployment, or change to the production runtime was performed.

To resume development, create a separate worktree from this branch, use the pinned Node/pnpm versions, install its own dependencies, rebuild workspace packages, and run the full required checks before deployment.
