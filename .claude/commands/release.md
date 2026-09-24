Explain or check the state of a release. Releases are automated; never push to `main` and never publish by hand.

How a release happens:

1. Merged PRs carry `.changeset/*.md` files (all packages share one version — the fixed group in `.changeset/config.json`).
2. `.github/workflows/release.yml` runs on changeset activity on `main` and keeps a "chore: version packages" PR up to date.
3. The user merges that PR. The same workflow then builds and publishes (`bun run release` = `scripts/build-batched.ts` + `scripts/publish.ts`), tags, and `release-native.yml` publishes the native compiler binaries.

Steps for this command:

1. Show pending changesets (`ls .changeset/*.md`) and the open version PR (`gh pr list --search "chore: version packages"`).
2. If $ARGUMENTS is a version, compare it with npm: `bun scripts/check-published-state.ts`.
3. Report anything lagging and the fix from `.agents/guides/ci/README.md` ("Release").
4. Do not merge the version PR — the user does.
