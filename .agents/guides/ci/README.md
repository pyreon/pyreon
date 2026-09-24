# CI architecture

Read before adding or changing a workflow, job, required check, or cache key.

## Constraint: runner slots, not minutes

- The org is on GitHub's free plan: 20 concurrent jobs org-wide, 5 of them macOS, shared by every open PR. Runner minutes are unmetered on a public repo.
- PR wall-clock is dominated by queue wait. The levers are job count and DAG depth, not per-job speed.
- A cell's fixed setup (queue + checkout + `setup-pyreon`, plus Playwright for e2e) is about a minute. Splitting work into more jobs only helps while runners are idle.

## Design rules

- A gate that takes seconds is a step, not a job. A new job needs a written reason it cannot be a step.
- Keep the graph two levels deep (plus the one aggregator).
- Every gate step inside `Fast Gates` / `Build` runs with `if: ${{ !cancelled() }}`, so one push reports every red gate.
- Matrices and decide outputs are fail-closed. A detection error runs the full set, because a skipped required check reports success to branch protection.
- Two deciders that gate the same downstream job must classify every path identically (`scripts/affected.ts` vs the e2e decide; `scripts/native-surface-touched.ts` feeds both native decides).
- Never rename a required job. To retire one, drop its name from both protection authorities before deleting the job. Never add a required name casually: it hangs every open PR on "Expected" until that PR's next push.
- One artifact ⇒ one cache key prefix ⇒ one writer. Duplicate writers fill the 10 GB actions cache and evict the small entries every PR needs.
- Small content-addressed stores (the native compile-verdict store) are saved from every run, because main's push runs are frequently cancelled.
- When adding a matrix cell, ask whether it needs its own runner or just its own step. Default: a step. Cells that key a cache on their own category (the `native-*` test cells) go in `scripts/ci-batch.ts`'s `--isolate` list.

## `ci.yml` jobs

| Level | Job | Contents |
| --- | --- | --- |
| 1 | `Install` | install → decide → build `lib/`. Outputs `code`, `affected`, and the batched `typecheck-` / `test-` / `e2e-` / `scaffold-matrix` lists. |
| 2 | `Fast Gates` | Every lib-free gate: lint, ratchets, docs sync, manifests, export entries, release readiness, doc examples, dependency audit, secrets scan, PR-targets-main. |
| 2 | `Build` | Every lib-needing gate: examples build, verify-modes, bundle + import budgets, distribution, bin liveness, coverage floor + changed packages, the Rust-binary equivalence run. |
| 2 | `typecheck (…)`, `test (…)`, `e2e (…)`, `Scaffold Smoke (…)` | Dynamic cells, packed by `scripts/ci-batch.ts` (LPT by measured weight). |
| 2 | `Test (browser)`, `Release Build`, `bootstrap-exit-codes` | |
| 3 | `Test` | The single aggregator over all four matrices (`scripts/ci-aggregate.ts`). |

- Lib-free vs lib-needing: typecheck, lint and vitest resolve `@pyreon/*` to `src` through the `bun` condition and do not need `lib/`. Exceptions are tests that assert on `lib/` bytes or boot a nested Vite SSR build. A new lib-needing gate goes in `Build`; a lib-free one in `Fast Gates`.
- `scripts/affected.ts` computes the per-PR package filter. A root-file change escalates to `--filter=*`.
- `ci-main.yml` runs `Coverage (Full)` and `Coverage (Native)` on push to main and in the merge queue.

## Other workflows

- `pr-gates.yml` — `Changeset` and `Diagnose Catalog`. These are label-sensitive (`skip-changeset`, `skip-diagnose-catalog`), so they live apart from `ci.yml`, whose `pull_request` trigger excludes `labeled` (a label would cancel the in-flight run).
- `native-validate.yml` — `Validate emitted Swift + Kotlin`, `Validate emitted Swift (real-SDK typecheck, macOS)`.
- `native-device.yml` — `iOS — xcodebuild (Simulator SDK)`, `Android — gradlew assembleDebug`.
- `codeql.yml` — `Analyze (javascript-typescript)`.
- `cancel-conflicting-ci.yml` (push to main + every 30 min):
  - cancels in-flight runs of PRs that became conflicting. GitHub never dispatches for a conflicting PR, but does not stop a run already in flight. Only a definitive `CONFLICTING` is acted on; `UNKNOWN` is skipped; a failed listing aborts.
  - prunes superseded cache generations on main (`scripts/prune-superseded-caches.ts`).
- `required-check-autoheal.yml` — re-runs a required check that landed `cancelled` (at most 2 attempts, with a PR comment). A genuine `failure` is never retried.
- `leak-sweep.yml` (advisory) — least-squares heap slope over the perf-dashboard journeys, dev mode only (counters tree-shake in production). Locally: `bun run perf:leak-sweep`.
- `docs-freshness-guard.yml` (push to main, not a PR check) — reruns `gen-docs` + `docs/scripts/gen-all.ts`. Drift from two concurrent merges reds the offending commit and opens or updates an `auto/docs-regen` fix PR (with a changeset when mcp `api-reference.ts` drifted; automerge when `RELEASE_PAT` is set).
- `published-state.yml` — daily repo-vs-npm check.

## Required checks

Branch protection pins 15 required contexts in two authorities that must stay identical: classic protection and ruleset 19416270.

`Install`, `Fast Gates`, `Build`, `Test`, `Test (browser)`, `Release Build`, `bootstrap-exit-codes`, `Changeset`, `Diagnose Catalog`, `Analyze (javascript-typescript)`, `CodeQL`, the two `Validate emitted Swift…` jobs, `iOS — xcodebuild`, `Android — gradlew`.

## Caches

- `bun-install-cache-<os>-<lockhash>`: `Install` saves it on main. A PR whose `bun.lock` differs from the base saves its own; everyone else only restores.
- The macOS native lanes restore and save the content-addressed verdict store, like their Linux twin.

## Gate reference

- **audit-types** (`bun run audit-types --all --strict`): flags public-interface fields with zero non-type references (typed-but-unimplemented). New HIGH findings block. Fix the runtime, or add to `EXEMPT_FIELDS` in `scripts/audit-types.ts` with a rationale.
- **verify-modes** (`bun run verify-modes`): `vite build` for every example × mode, asserting rendered content, not just a green build. New cells must check content.
- **check-bundle-budgets** / **check-import-budgets**: gzipped main-entry and minimal-import sizes against `scripts/{bundle,import}-budgets.json`, measured on built `lib/` with a `NODE_ENV=production` define. For intentional growth, `--update` and review the diff.
- **check-distribution**: every published package declares `sideEffects`, ships source maps, and excludes the `lib/analysis` bundle report (live `npm pack --dry-run` probe).
- **check-esm-only**: Pyreon ships ESM only. `require` and `default` export conditions are both banned in every published package — `default` lets `require('@pyreon/x')` resolve, which is what the policy forbids. The one exemption is `@pyreon/storybook` (Storybook's preset loader resolves through CJS), pinned by `shipped-preset.test.ts`. Accepted cost: Pyreon is absent from CJS-only toolchains, so `contrib/moltar/` is bun/deno only.
- **check-doc-claims**: numeric claims in docs must match source. The guarded claim sites live in the `checks` table in `packages/tools/cli/src/doctor/gates/doc-claims.ts`. Write exact numbers there, never "33+", and do not restate a count anywhere unguarded.
- **check-manifest-depth**: ratchet on MCP `get_api` density for locked packages.
- **Diagnose Catalog**: a source change in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` needs an `ERROR_PATTERNS` entry in `packages/core/compiler/src/diagnose.ts`, or the `skip-diagnose-catalog` label. `diagnoseError` + `ERROR_PATTERNS` live in the browser-safe `@pyreon/compiler/diagnose` subpath with no `typescript` import, so the dev error printer can load them client-side. `compiler/src/tests/diagnose.test.ts` bundles the subpath and asserts no TS-API markers.
- **Release**:
  - Changesets fixed group (all packages share one version).
  - `check-release-readiness`: `publishConfig.access` + fixed-group coverage.
  - `check-published-state`: every publishable package, not sentinels. A partial release where some packages lag the cut version is red and names each lagging package.
  - `scripts/publish.ts` retries only npm errors with evidence of being transient (5xx, dropped sockets). Never 404/403/conflict, and never `E422 Error verifying sigstore provenance bundle`, which reproduces on every attempt (a manifest missing `repository` causes it).
  - `release.yml`'s `resume-detect` / `resume-publish` republish lagging packages from the release tag (never main), once per version.
  - A new package's first publish needs a one-time manual OIDC trusted-publisher bootstrap.

## E2E suites

- `bun run test:e2e` plus per-suite `test:e2e:*` scripts in the root `package.json`, real Chromium, `retries: 2` in CI (from `@pyreon/playwright-config`).
- In CI the suites are batched into `e2e (…)` cells by `scripts/ci-batch.ts`.
- `ui-showcase-regression` covers runtime-dom, styler, rocketstyle, elements and unistyle through a real app. When a real-app regression surfaces in those packages, add a bisect-verified spec there.
- `@pyreon/zero` and `@pyreon/lint` ship large `coverageExclude` lists (integration code gated by e2e / verify-modes). Check the list before "fixing" low coverage.

## Diagnosing slow CI

- Queue vs work per job: `gh api repos/pyreon/pyreon/actions/runs/<id>/jobs`. Exclude `conclusion == "skipped"`. `started_at − created_at` is queue; `completed_at − started_at` is work.
- A wall clock far above summed work, with queue in the hundreds of minutes, is slot starvation.

## Bootstrap env vars

`scripts/bootstrap.ts`: `PYREON_BOOTSTRAP_SKIP`, `PYREON_BOOTSTRAP_SKIP_NATIVE`, `PYREON_BOOTSTRAP_SOFT`, `PYREON_BOOTSTRAP_FORCE_FAIL`.
