# Workflow Rules

`AGENTS.md` holds the short, always-read rules (senior-engineer bar, git rules, never merge, no AI attribution, changesets, bisect-verify). This file holds the detail behind them. CI architecture (jobs, required checks, caches, the gate reference) lives in `.agents/guides/ci/README.md`.

## Engineering bar — detail

Priorities: correctness > performance > DX > AI-friendliness.

- **Fix the class, not the reproduced shape.** Ask "what is the smallest description of every input that breaks?" Enumerating shapes is a smell: write a stress matrix across the container grammar (group rules, statement forms, anonymous forms; every value source, not every syntax) and fix at the layer where the class collapses to one rule. Two examples of symptom patches that shipped a successor days later: an `@layer` fix that handled one CSS shape but left `@layer` inside `@media` and the `@layer a, b;` statement broken; a `VNode[]` fix that covered two initializer syntaxes when the class was runtime values (props, params, cross-module calls).
- **Verify the mechanism, not just the symptom.** A plausible bug report can name the wrong cause. `bunx @pyreon/mcp` dying with `reading 'ESNext'` was not missing TypeScript but an uncapped `>=5.0.0` range resolving TypeScript 7. `[zero:ssg] Skipping SSG` on a stacked PR was a missing stack link, not a product bug. "I changed the code and the symptom went away" is not proof — caching, parallel-run flake or side effects can produce it.
- **Test against the real shape.** See `.agents/rules/test-environment-parity.md`: mock-vnode tests need a real-`h()` twin, browser packages need real-Chromium smokes, framework-primitive changes need e2e against examples.
- **Symptom or cause?** When a tactical fix (a doc note) and a structural fix (make the footgun impossible) both exist, pick the level deliberately and state the trade-off. Do not silently expand scope, and do not silently leave the cause.
- **Leave the area cleaner.** Fix adjacent bugs in the same PR, or open the follow-up PR immediately if it would balloon review. A TODO list is not a follow-up.
- **For complex changes, propose the approach before coding.**

## API design

1. Question the need.
2. Write the usage example first.
3. Study prior art (React, Solid, Vue, Svelte).
4. One concept per API.
5. Zero-config defaults, full-control escape hatches.
6. Familiarity with the web platform is a feature.
7. Types are inferred end to end, not annotated.

## Code changes

- Read the existing source in the area first, and check whether the pattern already exists in another package before writing a new one.
- One feature per PR, one concern per file.
- Naming: `signal()`/`computed()`/`effect()` for reactivity; `onMount`/`onUnmount` for lifecycle; `createX` for factories; `useX` for context hooks.
- Export types separately from runtime values.
- New public APIs get JSDoc with an `@example`.
- No unused imports, dead code or `// TODO` comments.
- Errors start with `[Pyreon]` and say how to fix the problem. Dev-only warnings use the gate described in `AGENTS.md` ("Library code").

## Recurring CI failure modes

Run `bun run validate-fast` before every push; the pre-push hook runs it too. When CI fails on a gate, ask whether `validate-fast` would have caught it — if yes, that is a workflow failure. Most gate names below are step names inside the `Fast Gates` or `Build` jobs; the fix commands are the same.

When CI fails on a gate not listed here, add a row in the same PR.

### Changesets, docs and claims

| Gate | When it trips | Fix |
|---|---|---|
| `Changeset` (`pr-gates.yml`) | Source change in a published package without `.changeset/<slug>.md` | `bun changeset` before staging. Test/spec/story files are exempt (`scripts/test-paths.ts:isTestPath`). |
| `Check No Major Changesets` | A changeset declares `major` | Pyreon is 0.x: use `minor` and describe the break in the prose. `scripts/cap-changeset-bumps.ts` also downgrades at release. |
| `Docs Sync (gen-docs --check)` | A `manifest.ts` edited without regenerating llms / api-reference | `bun run gen-docs` |
| `Docs Generated Fresh` | A manifest or `anti-patterns.md` edit without the second generator (docs-site `reference/`, `troubleshooting/`, examples) | `bun run gen-docs && bun docs/scripts/gen-all.ts`, commit the output. `validate-fast` runs both checks (`gen-docs --check`, `check-generated-fresh`). |
| Docs Sync / Docs Generated Fresh after a concurrent merge | Another PR touching generator inputs merged after your CI ran (protection is non-strict) | Rebase on `origin/main`, rerun both generators, commit. On main, `docs-freshness-guard.yml` opens an `auto/docs-regen` PR. |
| `Check Doc Claims` | A doc page added/removed or a locked count changed | `bun run check-doc-claims`. The guarded claim sites and counters live in `packages/tools/cli/src/doctor/gates/doc-claims.ts` (`countDocPages` walks all of `docs/**`). |
| `Check Doc Claims` red on a PR that touched no docs | `main` is already wrong: two doc PRs bumped the same count from the same base. The freshness guard cannot heal it — counts are hand-written prose. | Check main first (`git show origin/main:AGENTS.md \| grep 'doc pages'`). Fix the number in your branch; identical one-line edits merge cleanly. |
| `Multiplatform Matrix (headline == table sum)` | A row of `docs/src/content/docs/multiplatform.md` edited without recomputing the headline | Edit the table, run `bun scripts/check-multiplatform-matrix.ts`, paste the headline it prints. Never hand-edit the headline. |
| `check-multiplatform-tier` | A manifest lacks `multiplatform: { tier, rationale }`, a published package has neither manifest nor exemption, or the docs table drifted | Declare the tier (rationale required for `web-only`) or add an API-less package to `NO_MANIFEST_EXEMPT`. Table drift: `bun scripts/check-multiplatform-tier.ts --write-table`. |
| `Check Manifest Depth` | A `LOCKED` package's manifest density dropped below its floor | `bun run check-manifest-depth`. When raising a package to density, add it to `LOCKED` in `scripts/check-manifest-depth.ts` with the numbers achieved. |
| `Check Manifest Examples` | A manifest `example`/`longExample` no longer typechecks against the shipped export | `bun run check-manifest-examples`; fix the example to match the shipped runtime. Harness limitations go in `NON_ENFORCED` in `scripts/check-manifest-examples.ts` with a rationale (the list only shrinks). |
| `Diagnose Catalog` (`pr-gates.yml`) | Source change in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` without a new `ERROR_PATTERNS` entry | Add an entry in `packages/core/compiler/src/diagnose.ts`, or the `skip-diagnose-catalog` label for catalog-irrelevant changes. |
| `Diagnose Catalog` after editing `diagnose.ts` | You reworded an entry instead of adding one (the gate compares counts). Separately, an entry containing `createSourceFile` / `SyntaxKind` / `createLanguageService` trips `diagnose.test.ts`'s browser-bundle check, because string literals survive bundling. | When a fix removes an error, teach the residual footgun. Name TS members via `ScriptTarget`/`ScriptKind`/`ESNext`. No gate reruns the compiler suite after a diagnose edit — run `bun run --filter='@pyreon/compiler' test`. |
| mcp `token-budget.test.ts` density caps | A new `anti-patterns.md` entry's index line is too dense (average ≥ 55 tokens per entry, or one line ≥ 100) | Tighten the entry's title and hook. Do not raise the caps. If the 12,000-token total trips, paginate `get_anti_patterns`. |

### Lint and ratchets

| Gate | When it trips | Fix |
|---|---|---|
| `Lint Ratchet (oxlint warn baseline)` | An oxlint `warn` count exceeded `lint-baseline.json` | `bunx oxlint .`, fix or scope with rationale. After reducing counts: `bun run check-lint-ratchet -- --update`. Never raise a count to absorb a finding. |
| `Lint Ratchet (pyreon-lint advisory baseline)` | An `@pyreon/lint` advisory count over framework `src` exceeded `pyreon-lint-baseline.json` | `bun run lint:pyreon`; fix, or scope the rule off in `.pyreonlintrc.json` with rationale when it does not apply to that framework package. Tighten with `bun run check-pyreon-lint-ratchet -- --update`. |
| `check-tsconfig-presets` | A package/example tsconfig does not extend an `@pyreon/tsconfig` preset | Add the `"@pyreon/tsconfig": "workspace:*"` devDep and `extends` `@pyreon/tsconfig/lib[-jsx].json` (examples: `example.json`); opt-outs go in the script's `EXEMPT`. |
| `validate-fast gates not run elsewhere (ci-complement)` | A gate that lives only in `scripts/validate-fast.ts` failed | `bun scripts/validate-fast.ts --ci-complement` runs exactly what CI ran (computed from `scripts/gate-wiring.ts`; `check-gates-wired` guards the step). |

### Size and distribution

| Gate | When it trips | Fix |
|---|---|---|
| `Check Bundle Budgets` | A new publishable package, or runtime growth | `bun run check-bundle-budgets`. Growth is intentional: bump that one entry. |
| `Check Bundle Budgets` green locally, red in CI | Headroom is smaller than the gzip delta between macOS and the ubuntu gate (hundreds of bytes). The gate's own suggestion is platform-dependent too. | Take the measured size and suggested budget from the CI log and bump that one entry by hand with real margin (peers sit at 1.3–3%). Do not run `--update` on macOS: it rewrites every entry to macOS sizes, each then one platform delta from red. Check the table's headroom first (`--json` vs `scripts/bundle-budgets.json`). `budget-suggestion.test.ts` locks the suggestion logic. |
| `Check Import Budgets` | A canonical minimal import (`mount`, `signal/computed/effect`, basic router) grew | `bun run check-import-budgets`; find why (eager import, lost `/*#__PURE__*/`, `sideEffects` regression) before `--update`. |
| `Check Distribution` | A new published package, or a `files` edit dropping `lib/**/*.map` | `bun run check-distribution` |
| `Check Declarations` | A published `.d.ts` imports an undeclared package, or an emitted declaration is invalid. Silent for consumers: under the default `skipLibCheck: true` the type becomes `any` | `bun run check-declarations` after bootstrap. Declare the package, or give the inferred export a named type |
| `Release Readiness` | A new published package without `publishConfig.access: "public"` or outside `.changeset/config.json` `fixed[0]` | `bun run check-release-readiness` |
| `Check Export Entries` / `Release Build` | An `exports` subpath `"./X"` has no `src/X.{ts,tsx}` (the build derives entries from the key). Incremental CI builds pass; the release's clean `build-batched` fails with `UNRESOLVED_ENTRY` and aborts every publish. | `bun run check-export-entries`. Rename the file or the key. |
| `Check Bin Liveness`: "declares bin … with NO liveness policy" | A published package added or renamed a `bin` target | Add the target path to `BIN_POLICY` in `scripts/check-bin-liveness.ts`. |
| `check-lockfile-version` / `Install` fails with `Unknown lockfile version` | `bun.lock` was written by a bun newer than `.bun-version`. Bun rewrites the lockfile only when a resolution changes, so a mismatched local bun goes unnoticed until the first dependency edit; every installing job then dies at setup. | `bunx bun@<.bun-version> install` and commit. `BUN_LOCKFILE_SUPPORT` in `scripts/check-lockfile-version.ts` maps each pinned bun to the lockfile versions it can read; an unknown bun fails by name. |
| `typecheck (…)`: `TS2307 Cannot find module '@pyreon/x/subpath'` | A `bun.lock` reset dropped a dependency edge. `git checkout <ref> -- bun.lock` stages the change, and a later commit includes it. CI's `--frozen-lockfile` then lacks the symlink that a local non-frozen install created. | `git diff <parent-branch> -- bun.lock` must be empty. After a lock reset, check `git diff --cached --name-only` and `git restore --staged bun.lock`. The lock's dep string must match `package.json` exactly (`workspace:*` ≠ `workspace:^`). |

### Native

| Gate | When it trips | Fix |
|---|---|---|
| `Build` / `Verify Modes` / `E2E` / `e2e (native-*-web)` red together after a shared-source change | A tri-target `examples/native-*-ios/src/App.tsx` gained an import the web sibling cannot resolve (native targets never read `node_modules`). Reported as a blank page. | `bun run check-shared-source-deps` names the package; add it to the web example's `package.json`, `bun install`, commit `bun.lock`. For rendering changes, run `bun run test:e2e:native-router-demo-web`. |
| `iOS — xcodebuild` red on a Keychain test that passes locally | `xcodebuild test … CODE_SIGNING_ALLOWED=NO`: an unsigned simulator app has no entitlements and securityd denies `SecItemAdd`. Local builds ad-hoc sign. xcodegen's `entitlements:` alone does not embed entitlements under ad-hoc signing; `CODE_SIGN_ENTITLEMENTS` does. | `bun run check-ios-signing-policy` enforces both: no `CODE_SIGNING_ALLOWED=NO` on `xcodebuild test` (allowed on `build`), and every `native-*-ios` example sets `CODE_SIGN_ENTITLEMENTS`. |
| `native chart engine — generated, drift-locked` after an edit to `packages/fundamentals/charts/src/engine/*` | Those modules are `ENGINE_FILES`; the Swift/Kotlin engine is generated from them and committed. Without regeneration native keeps the old behaviour. | `bun packages/native/compiler/scripts/gen-chart-engine.ts`, commit `PyreonChartEngine.swift` / `.kt` / `chart-engine-structs.ts` with the source edit. Do not diagnose from the diff's Expected/Received labels — run the generator and check whether the diff is empty. |
| Native lanes run on a PR that touches nothing native | — | Both native decide jobs use `scripts/native-surface-touched.ts` (fail-closed, unit-tested). Before trusting a directory-name regex, check every sibling that uses the name (`ls -d packages/*/*/native` — the JSX compiler's napi crate is `packages/core/compiler/native/`). |

### Coverage

| Gate | When it trips | Fix |
|---|---|---|
| `Coverage (Full)` (`ci-main.yml`, main only) red, not caused by your PR | A package drifted below its threshold on main | Fix the gate; never rerun past it. Triage per package: (a) a file at ~0% in the node run because only a `*.browser.test.tsx` covers it → `coverageExclude` with a rationale (never exclude a file covered nowhere); (b) a cheap real gap → write the test; (c) re-baseline to the measured value with a `scripts/check-coverage.ts` exemption entry (table and config must match) and ratchet back up. Never lower thresholds in bulk. Trust the results table, not interleaved progress lines. |
| `Coverage (changed packages)` (PR time) | Your PR lowered a directly changed package's coverage | It measures `affected.ts --changed-only` (directly changed workspaces), because coverage depends on a package's own sources and tests, not the dependent closure. |
| `Coverage (Native)` | `@pyreon/native-compiler` coverage | Measured alone in `ci-main.yml` with the verdict cache and serial files; `Coverage (Full)` runs `--skip=@pyreon/native-compiler`. An unknown `--skip` name fails the script, so the skip cannot silently stop matching. A job a package is deferred to must actually be able to run it (cap, cache, isolation). |

### PR state, stacking and merge refs

| Symptom | Cause | Fix |
|---|---|---|
| A PR shows only a CodeQL run, or far fewer checks than usual, through pushes and reopens | The PR is CONFLICTING; GitHub cannot build `refs/pull/N/merge` and dispatches nothing | `gh pr view N --json mergeable,mergeStateStatus`. Merge `origin/main`, union-merge prose hunks, resolve generated files by regenerating, rerun `check-doc-claims`, push. |
| `PR targets main` | The base is another feature branch | `gh pr edit <N> --base main`. Branch-protection checks apply only to `main`, so a PR into a feature branch is never gated. |
| A stacked PR goes red with a duplicated hunk (`invalid redeclaration`) right after its parent merges | GitHub's merge ref applies the parent's hunk twice (once from `main`, once from the child's copy). Every local check passes. | Inspect the merge ref: `git fetch origin refs/pull/<N>/merge:refs/remotes/pr<N>m && git show pr<N>m:<file>`. Rebase with `git rebase --onto origin/main <old-parent-tip> <branch>` and re-check the merge ref. |
| A stacked PR's own new test fails like a product regression | The branch does not contain the parent's commits | `git merge-base --is-ancestor <parent-tip> <child-branch>`; rebase onto the parent, then state the merge order in the PR. |
| `E2E` aggregator red with an empty e2e matrix | `affected.ts` and `e2e-affected.ts` classified a path differently, so bootstrap skipped while decide said "run" | Any pair of deciders gating the same job must classify every shared path identically; fix the classifiers, never loosen the fail-closed aggregator. |

### Release and workflow scripts

| Symptom | Cause | Fix |
|---|---|---|
| Native binaries (`@pyreon/compiler-<platform>`) lag the JS packages on npm, so consumers fall back to the slower JS transform | A tag push failed after `npm publish`, leaving `outputs.published` unset, so the step gated on it skipped and `release-native.yml` never fired | `scripts/heal-release-chain.ts` runs on every Release invocation (`if: always()`) and decides from ground truth (npm, origin tags, native runs), retro-tags the version-bump commit and dispatches `release-native.yml`. A step gated on another step's `outputs` only runs on that step's happy path; derive load-bearing conditions from ground truth. |
| A release published only some packages | A partial publish (for example npm `E422` provenance failures) | `check-published-state` compares every publishable package to its repo version and names laggards. `publish.ts` retries only errors with evidence of being transient (`scripts/publish-retry.ts`). `release.yml` `resume-detect` → `resume-publish` republishes from the release tag once per version; a release broken by its own tag (e.g. a manifest with no `repository` field, which provenance always rejects) cannot be fixed by replaying it. |
| `Release` fails at checkout with `could not read Username for 'https://github.com'` | `secrets.RELEASE_PAT \|\| secrets.GITHUB_TOKEN` tests presence, not validity; an expired PAT is taken | The `Select a usable checkout token` step probes the PAT and falls back with a warning. Rotate the secret: the PAT is what makes pushed tags trigger workflows. |
| A workflow step exits 127 on `push: main` while every PR was green | A shell function is called above its definition in a branch only non-PR events reach (past an early exit) | `bun scripts/check-workflow-shell-order.ts`. Read the path past an early exit as a separate, untested script. |
| A `run:` step exits 1 with nothing printed | `run:` uses `bash -e`; `x=$(probe); code=$?` aborts when the probe exits non-zero | `set +e` … `set -e`, or `x=$(probe) \|\| code=$?`. Dry-run step scripts with `bash -e`. |
| `check-cache-key-sync` path-list mismatch | A cache step under a shared key prefix declares a different `path:` block (entries are versioned by key and path list) | Make every site under the prefix declare the identical `path:` block. |
| Bundle size diff / perf / leak-sweep red on a comment-post failure | An advisory workflow failed while posting a PR comment | Rerun. `check-advisory-comment-steps` requires `retries:` and a `catch` calling `core.warning`; notifier workflows are listed in `NOTIFIER_WORKFLOWS`. |
| `Scaffold Smoke (…)` batch containing `cpa-smoke-monorepo-vercel` | Workspace version is ahead of npm (release in flight) | Auto-skipped by `shouldSkipIsolatedCell` in `scripts/scaffold-smoke.ts`; if it still fails, the npm-version check failed or the branch is `changeset-release/*`. |
| `Scaffold Smoke` red with a registry `404` on a tarball | A just-published version not yet replicated | `isTransientRegistryFailure` retries once; resolution and build errors are never retried. |

### Gate health

- A fix applied to one call site is not a fix. When you fix a CI trap, state the invariant it implies, apply it everywhere it holds, and gate it.
- A gate that is permanently red, flaky, or unable to fail is worse than no gate. Finding one is a finding: fix it in its own PR.
- A wall-clock threshold inside a required check is flaky by construction. Test for determinism (does it fail every time?) and look at the spread within one attempt (`perf-stress.browser.test.tsx` once logged five identical runs varying 3.3×). Gate the property that holds on any machine, log the duration, and keep timing in the advisory lane (`@pyreon/perf-harness`, `perf.yml`, `.agents/guides/benchmarks/README.md`). Do not widen the threshold.
- A bench that cannot run is an UNMEASURED row and must fail the run, never an omitted row in a green artefact (`scripts/bench/run-all.ts` exits non-zero naming it). Under esbuild a JSON module imported `with { type: 'json' }` has only a default export, so package entries' named `name`/`version` import needs the `jsonNamedExports` plugin in `scripts/bench/bundle-size.ts`.
- CI is queue-dominated (see `.agents/guides/ci/README.md`): a gate that takes seconds is a step, not a job. To diagnose: `gh api repos/pyreon/pyreon/actions/runs/<id>/jobs`, exclude `conclusion == "skipped"`, then `started_at − created_at` is queue and `completed_at − started_at` is work.

## Restacking after a parent merges

Each of these traps reports success while destroying something.

1. **A clean rebase is not a working feature.** After any history rewrite, bootstrap and run the PR's own specs.
2. **`git checkout --ours <file>` takes the whole file, not the conflicted hunk.** Resolve the hunk, then diff against the pre-rebase commit to prove nothing else moved.
3. **`gh run rerun` replays the original event payload.** A label added after the run is invisible to a rerun; only a new push carries it.
4. **A gate that could not execute is not a gate reporting drift.** In a worktree without `node_modules`, `check-generated-fresh` fails with `Cannot find module '@pyreon/manifest'`. Read the output, not the exit code. Never silence a generator with `>/dev/null 2>&1`.

Recipe when a parent was squash-merged:

1. Find the boundary commit — the last one belonging to the parent.
2. `git rebase --onto <corrected parent> <boundary> <branch>`, so only the PR's own commits replay. A plain `rebase origin/main` re-applies the parent's commits.
3. Bootstrap, then run the PR's own specs.
4. Check the diff shrank by roughly the parent's size and the PR's own change is intact.

Restack in dependency order, not PR order. Never use a bare `git stash pop` during a restack — the stash is shared across worktrees.

**A per-backend bisect that passes proves your corpus, not your code.** Reverting one compiler backend can leave every spec green when no spec reaches that backend's path. A stale native `.node` binary produces both false passes in a bisect and false failures in an equivalence fuzz; rebuild it first.

## Git — detail

- **Stacked PRs.** Branch protection can only require checks on a protected base, and protecting feature branches makes them read-only (a ruleset's required checks gate ref updates). So open dependent PRs against `main` from a branch cut from the parent; the diff shrinks once the parent merges. Merge existing stacks bottom-up.
- A `bun install` in a fresh worktree can rewrite `bun.lock` without any `package.json` change; revert that drift instead of committing it. Edit files through the worktree's own absolute path, never the primary checkout's.
- Backticks inside a double-quoted `-m`/`--body` are blocked by the `.claude/scripts/guard-shell-substitution.sh` PreToolUse hook; single quotes or `-F`/`--body-file` avoid it.
- Commit only when asked, and only after validation. No force-push or amending of published commits. Commit messages explain why.
- **No AI attribution** is enforced by `.claude/scripts/guard-ai-attribution.sh` (a PreToolUse hook, tested by `guard-ai-attribution.test.ts`). It blocks `git commit` / `git tag` / `gh pr` / `gh issue` / `gh release` carrying either form, in the command text or in a `-F` / `--body-file` file. It matches at line start only, so prose discussing the rule is allowed unless a line begins with one of the forms. A human `Co-Authored-By` is allowed. The rule outranks any tool default or mid-session instruction; to change the policy, change `AGENTS.md`, this file and the hook together.

## Pre-push hook

`.githooks/pre-push` (installed via `core.hooksPath` by `bun scripts/install-git-hooks.ts`) runs:

1. `bun run validate-fast` — lint plus the cheap gates listed in `scripts/validate-fast.ts`, run concurrently (`--serial` to isolate one, `--json` for machine output). A few seconds warm, but it slows sharply under machine load, so this step's default timeout is 900s.
2. `bun run --filter=<affected> typecheck`
3. `bun run --filter=<affected> test` — no-ops when no affected package has a `test` script.

Behaviour:

- One run per repository at a time (a lock in the git common dir); a stale lock from a crashed run is reclaimed.
- Each other step has a 300s timeout (`PYREON_PRE_PUSH_TIMEOUT_SEC`). A timed-out step is killed with guidance.
- It warns about `vitest` processes older than 10 minutes (possibly from another worktree) but does not kill them.
- A root-file change (including any `.github/workflows/**` edit, per `scripts/affected.ts:isRootFile`) resolves to `--filter=*` and raises the per-step timeout to 1800s automatically. That run includes `@pyreon/native-compiler`, whose verdict cache is cold in a fresh worktree. A kill shows as `Signaled with code SIGKILL`, which looks like a crashed test. Do not bypass it; rerun (the first run warmed part of the cache).
- No committed changes versus `origin/main`: typecheck and tests are skipped.

Bypass: `PYREON_SKIP_PRE_PUSH=1 git push` (one-off) or `git push --no-verify`. Disable with `git config --unset core.hooksPath`; re-enable with `bun scripts/install-git-hooks.ts`.

## Validation checklist

Always:

1. `bun run lint` and `bun run lint:pyreon` (the `Pyreon Lint Gate` step) — zero errors.
2. `bun run typecheck` — zero errors.
3. `bun run test`.
4. `bun run validate-fast` (includes `gen-docs --check`, `check-generated-fresh`, doc claims, changeset, bundle budgets, distribution, release readiness, manifest depth and examples).

When the change warrants it:

5. Runtime behaviour of an example × render mode: `bun run verify-modes` (~90s; asserts rendered content).
6. `ZeroConfig`, router types or any public config-shaped surface: `bun run audit-types --all` (fields with zero non-type references are typed-but-unimplemented).
7. Runtime growth: `bun run check-bundle-budgets` (gzipped main entry vs `scripts/bundle-budgets.json`; lazy chunks excluded).
8. A published `package.json`: `bun run check-distribution` (`sideEffects` declared, source maps shipped — checked with `npm pack --dry-run`).
9. Signals, mount, router or fs-router behaviour: `bun run test:e2e` (needs `bunx playwright install chromium`).
10. Docs or an API docs reference: `bun scripts/check-doc-examples.ts` typechecks doc code blocks whose first line is `// @check` (opt-in).
11. A user-visible error path in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/`: add an `ERROR_PATTERNS` entry in `packages/core/compiler/src/diagnose.ts`. The `Diagnose Catalog` gate ignores `package.json`, docs, `tsconfig.json`, tests and stories (`scripts/check-diagnose-catalog.ts:isSensitiveSourceFile`) and auto-skips `changeset-release/*` branches.
12. Source in a published package: `bun changeset`. The `Changeset` gate ignores private packages, changeset-`ignore`d workspaces (examples, docs) and test/spec/story files (`scripts/check-changeset-required.ts:isConsumerAffectingFile`, sharing `scripts/test-paths.ts` with the diagnose gate). `scripts/publish.ts` strips `src/` from tarballs (`stripSrcFromFiles`). The `skip-changeset` label covers genuinely consumer-irrelevant edits.

Never run `gh pr merge` unless the maintainer said "merge it" for that specific PR.

## Bisect-verify procedure

For every regression test in a fix PR:

1. Save the fix.
2. Revert it temporarily.
3. Run the test; confirm it fails with the expected error.
4. Restore the fix.
5. Run the test; confirm it passes.

If step 3 passes, the test proves nothing (a minifier folding dead code once made a dev-gate test pass against the broken pattern). Record the result in the PR description: "Bisect-verified: reverted fix, test failed with `<error>`, restored, test passed." For code read from `lib/` (plugins, spawned bins) rebuild between steps; see `.agents/rules/testing.md`.

## Before considering work complete

1. Lint, typecheck and tests pass.
2. New exports are in `src/index.ts`.
3. Every package has `LICENSE` (MIT, byte-identical to the root; `check-license-coverage`) and `README.md`.
4. Documentation surfaces are updated in the same PR:
   - `AGENTS.md` for rules that apply to almost every change; `.agents/rules/*` and `.agents/guides/*` for situational detail (new anti-patterns go to `.agents/rules/anti-patterns.md`).
   - The package's `src/manifest.ts`. It generates `llms.txt`, `llms-full.txt`, the MCP api-reference (`packages/tools/mcp/src/api-reference.ts`, between `// <gen-docs:api-reference:start @pyreon/<name>>` markers) and the docs-site reference. Run `bun run gen-docs && bun docs/scripts/gen-all.ts`; never edit generated output. Each manifest has a `manifest-snapshot.test.ts` (reference: `packages/fundamentals/flow/src/tests/manifest-snapshot.test.ts`, using `renderApiReferenceEntries`); update snapshots with `bun run test -- -u` in that package.
   - Hand-written `docs/` pages and the package `README.md`.
   - JSDoc on exported APIs, and source comments where the why is not obvious.
   A package without a manifest is either in `NO_MANIFEST_EXEMPT` (`scripts/check-multiplatform-tier.ts`) or needs one: `manifest.ts`, the `@pyreon/manifest` devDep, the marker pair, `gen-docs`, and a snapshot test. Density bar for `summary`/`mistakes`: `flow`, `query`, `form`, `hooks`.
5. No breaking change without discussion.
6. An honest assessment of what is and is not done.

Never hand-edit generated lines — the next generator run reverts them. If the generator itself is broken, fix the generator.

## Debugging

- Check dependency versions and module resolution first (a stale `lib/` is the usual cause of `MISSING_EXPORT`; run `bun scripts/bootstrap.ts`).
- Use `registerErrorHandler` (`@pyreon/core`) to surface swallowed errors.
- Verify with tests; do not assume.
- Document the why of any workaround in a code comment and in `.agents/rules/anti-patterns.md`.
- Reproduce in isolation before blaming an upstream dependency.
