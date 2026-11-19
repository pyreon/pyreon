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

Release candidates (changesets pre mode, `.changeset/pre.json` present):

- Every version is `X-rc.N` and publishes to the `rc` dist-tag; `latest` stays on the last stable release. `check-published-state` compares against `rc`. Check with `npm view @pyreon/core dist-tags`.
- The Version PR is titled `chore: version packages (rc)`.
- The full runbook is in `.agents/guides/ci/README.md`, under "Release candidates and the 1.0 cut". In short:
  - **Enter:** one PR sets `APPROVED_MAJOR = '1.0.0'` in `scripts/major-release.ts`, runs `bun changeset pre enter rc` and adds one `'@pyreon/core': major` changeset.
  - **Iterate:** merge each Version PR to publish the next rc.
  - **Exit:** one PR runs `bun changeset pre exit` and sets the switch back to `null`. Merging the following Version PR publishes `1.0.0` to `latest`.
- If $ARGUMENTS asks to enter or exit, prepare that PR on a worktree branch and stop. The user merges it.
