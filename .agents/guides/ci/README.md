# CI architecture

Read before adding or changing a workflow, job, required check, or cache key.

## Constraint: runner slots, not minutes

- The org is on GitHub's free plan: 20 concurrent jobs org-wide, 5 of them macOS, shared by every open PR. Runner minutes are unmetered on a public repo.
- PR wall-clock is dominated by queue wait. The levers are job count and DAG depth, not per-job speed.
- A cell's fixed setup (queue + checkout + `setup-pyreon`, plus Playwright for e2e) is about a minute. Splitting work into more jobs only helps while runners are idle.

## Design rules

- A gate that takes seconds is a step, not a job. A new job needs a written reason it cannot be a step.
- Keep the graph shallow: Install, then Fast Gates, then expensive fan-out
  (plus the one aggregator). The extra preflight edge is intentional: it keeps
  expensive runners idle until cheap deterministic checks prove the commit is
  worth testing.
- Every gate step inside `Fast Gates` / `Build` runs with `if: ${{ !cancelled() }}`, so one push reports every red gate.
- Matrices and decide outputs are fail-closed. A detection error runs the full set, because a skipped required check reports success to branch protection.
- Expensive matrices use `fail-fast: true`, and sequential batches stop on the
  first real failure. Preserve diagnostics/upload/cache steps with
  `if: always()` rather than continuing expensive test work after red.
- Two deciders that gate the same downstream job must classify every path identically (`scripts/affected.ts` vs the e2e decide; `scripts/native-surface-touched.ts` feeds both native decides).
- Never rename a required job. To retire one, drop its name from both protection authorities before deleting the job. Never add a required name casually: it hangs every open PR on "Expected" until that PR's next push.
- One artifact ⇒ one cache key prefix ⇒ one writer. Duplicate writers fill the 10 GB actions cache and evict the small entries every PR needs.
- Small content-addressed stores (the native compile-verdict store) are saved from every run, because main's push runs are frequently cancelled.
- When adding a matrix cell, ask whether it needs its own runner or just its own step. Default: a step. Select cache ownership by membership and key the cache by its stable category, never by a batch name that changes with packing. `native-rest` has exactly one cache writer even when it shares a runner.
- All PR selectors in `ci.yml` use `CI_BASE`, the event's immutable base SHA. Do not fetch a moving base independently in each cell: selection and execution must use the same diff while main advances.

## `ci.yml` jobs

| Level | Job | Contents |
| --- | --- | --- |
| 1 | `Install` | install → decide → build `lib/`. Outputs `code`, `affected`, and the batched `typecheck-` / `test-` / `e2e-` / `scaffold-matrix` lists. |
| 2 | `Fast Gates` | Every lib-free gate: lint, ratchets, docs sync, manifests, export entries, release readiness, doc examples, dependency audit, secrets scan, PR-targets-main. Cheap gates collect all diagnostics. |
| 3 | `Build` | Every lib-needing gate: examples build, verify-modes, bundle + import budgets, distribution, bin liveness, coverage floor + changed packages, the Rust-binary equivalence run. |
| 3 | `typecheck (…)`, `test (…)`, `e2e (…)`, `Scaffold Smoke (…)` | Dynamic cells, packed by `scripts/ci-batch.ts` (LPT by measured weight). Sibling cells cancel after the first failure. |
| 3 | `Test (browser)`, `Release Build`, `bootstrap-exit-codes` | |
| aggregate | `Test` | The single fail-closed aggregator over Install, Fast Gates, and all four matrices (`scripts/ci-aggregate.ts`). It depends on every member so it consumes a runner only for the final verdict. |

- Lib-free vs lib-needing: typecheck, lint and vitest resolve `@pyreon/*` to `src` through the `bun` condition and do not need `lib/`. Exceptions are tests that assert on `lib/` bytes or boot a nested Vite SSR build. A new lib-needing gate goes in `Build`; a lib-free one in `Fast Gates`.
- `scripts/affected.ts` computes the per-PR package filter. Root configuration, workflow and shared-action changes escalate to `--filter=*`; E2E and scaffold selectors also cover shared actions.
- `scripts/ci-batch.ts` uses separate `typecheck`, `test`, `e2e`, and `scaffold` profiles. A suite name is not a global cost: `core` E2E and core package tests are different workloads. The profile records measurement provenance. Unknown members still run with a default weight. Small selected workloads use fewer runners; caps remain 3 typecheck, 3 test, 4 E2E, and 3 scaffold batches. All seven scaffold fixtures now fit on one runner (~49s of measured work after removing repeated root bootstrap), avoiding two redundant setups; the cap leaves room for future growth.
- `Test` validates `toJSON(needs)` after its dependencies finish. Install and Fast Gates must succeed; each selected matrix must succeed; only explicitly unselected matrices may skip. Missing, malformed, or contradictory selection outputs fail. Healthy runs make no jobs-API calls. Failed runs request job links once, with a ten-second total deadline; unavailable or stale API data cannot change the failed verdict.
- `scripts/check-ci-fail-fast.ts` statically prevents an expensive job from
  bypassing Fast Gates or a matrix from disabling cancellation.
- `ci-main.yml` runs `Coverage (Full)` and `Coverage (Native)` on push to main and in the merge queue. Coverage-infrastructure PRs also run `Coverage (Full)`; native coverage retains its main/merge-group scope.

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

- Downstream `node_modules` restores use the exact lockfile key only. A broad prefix downloads a tree the clean-install fallback must immediately discard to avoid stale peer resolution. The bun tarball cache still uses a prefix safely. The setup action exposes whether it already restored tarballs so scaffold jobs do not download the same store twice.
- Scaffold CI restores this commit's libraries through setup-pyreon, then sets `PYREON_BOOTSTRAP_SKIP=1` for the smoke step. Each temporary app otherwise changes `bun.lock`, invalidates bootstrap's global hash, and rebuilds every package again. This skips only the root bootstrap; generated-app installs, dependency lifecycle scripts, builds and smoke assertions still run. Local scaffold runs keep the default bootstrap behavior.
- `bun-install-cache-<os>-<lockhash>`: `Install` saves it on main. A PR whose `bun.lock` differs from the base saves its own; everyone else only restores.
- The macOS native lanes restore and save the content-addressed verdict store, like their Linux twin.
- Native workers write `.cache/pyreon-native-validate`; Actions archives only `.cache/pyreon-native-validate-archive`. Hydrate before tests and snapshot complete atomic JSON verdict/probe records before every save, including cancellation paths, with `scripts/snapshot-native-verdict-cache.ts`. Workers can outlive a cancelled test step, and GNU tar rejects a directory that changes while it reads. A green cache action can hide a failed upload warning: confirm the log's saved key and the cache API entry. Changing the archived path changes Actions' cache version, so the first run of this format is cold; keep restore/save paths aligned across all native lanes.

## Gate reference

- **Coverage (Full)**: main and merge groups measure every testable workspace except the native compiler, which retains its separate cached coverage job. Coverage-infrastructure PRs also run the full gate before merging. The four-worker pool is followed by three serial nested-build suites; budget for both phases. The full job has a 35m backstop, a 25m coverage step and a 3m always-run log upload. Each package logs its start and duration, so a partial run identifies work still in flight. No package thresholds are relaxed.
- **audit-types** (`bun run audit-types --all --strict`): flags public-interface fields with zero non-type references (typed-but-unimplemented). New HIGH findings block. Fix the runtime, or add to `EXEMPT_FIELDS` in `scripts/audit-types.ts` with a rationale.
- **verify-modes** (`bun run verify-modes`): `vite build` for every example × mode, asserting rendered content, not just a green build. New cells must check content.
- **check-bundle-budgets** / **check-import-budgets**: gzipped main-entry and minimal-import sizes against `scripts/{bundle,import}-budgets.json`, measured on built `lib/` with a `NODE_ENV=production` define. Rebuild each changed package before measuring locally; source-resolving tests and typechecks can pass while these gates measure yesterday's library. Run both size gates after that rebuild. For intentional growth, `--update` and review the diff.
- **check-distribution**: every published package declares `sideEffects`, ships source maps, and excludes the `lib/analysis` bundle report (live `npm pack --dry-run` probe).
- **check-esm-only**: Pyreon ships ESM only. `require` and `default` export conditions are both banned in every published package — `default` lets `require('@pyreon/x')` resolve, which is what the policy forbids. The one exemption is `@pyreon/storybook` (Storybook's preset loader resolves through CJS), pinned by `shipped-preset.test.ts`. Accepted cost: Pyreon is absent from CJS-only toolchains, so `contrib/moltar/` is bun/deno only.
- **check-doc-claims**: numeric claims in docs must match source. The guarded claim sites live in the `checks` table in `packages/tools/cli/src/doctor/gates/doc-claims.ts`. Write exact numbers there, never "33+", and do not restate a count anywhere unguarded.
- **check-license-coverage**: every workspace (packages, examples, docs, contrib) carries the root `LICENSE` byte for byte and declares `"license": "MIT"` (`--fix` copies and normalises). It also scans every runtime dependency of every published package: strong copyleft (GPL/AGPL/LGPL/SSPL/BUSL) fails; weak copyleft (MPL/EPL/CDDL/EUPL) fails unless disclosed in `THIRD-PARTY-NOTICES.md`; a dual licence is classified by its weakest half. An absent install store skips the dependency scan loudly.
- **check-native-coverage**: the registry of every package that should reach iOS/Android, each pinned to how it crosses (`pmtc-lowers` = a representative snippet lowers for both targets with zero warnings; `native-container`; `webview-host`). `check-multiplatform-tier` only proves a story is declared; this proves it is true. Companion `check-native-lifecycle-wiring` requires every native container exposing `start()`/`connect()` to be auto-started by both emits or registered manual with a rationale (a never-called `start()` ships frozen at its initial value).
- **check-manifest-depth**: ratchet on MCP `get_api` density for locked packages.
- **Diagnose Catalog**: a source change in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` needs an `ERROR_PATTERNS` entry in `packages/core/compiler/src/diagnose.ts`, or the `skip-diagnose-catalog` label. `diagnoseError` + `ERROR_PATTERNS` live in the browser-safe `@pyreon/compiler/diagnose` subpath with no `typescript` import, so the dev error printer can load them client-side. `compiler/src/tests/diagnose.test.ts` bundles the subpath and asserts no TS-API markers.
- **Release**:
  - Changesets fixed group (all packages share one version).
  - `check-release-readiness`: `publishConfig.access`, exact provenance repository identity and fixed-group coverage. The publisher shares the repository check and rejects the whole selected plan before any manifest rewrite or publish if its metadata is missing or mismatched.
  - Native coverage allows a cold verdict cache: a 60-minute measurement ceiling inside a 75-minute job, with per-compile and per-test deadlines still enforced. Stub/compiler changes invalidate cached verdicts.
  - `Release Build` and the publishing workflow reject high-severity locked dependency advisories with `bun audit --audit-level=high`. The isolated Verify Modes workerd tool installs with `npm ci` from `scripts/verify-modes-tools/package-lock.json` and audits that tree too; update the lock together with its manifest.
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
- Compare work separately from setup and queue time. Per-category and per-suite log groups delimit the work used to refresh `ci-batch.ts` profiles. Replaying old timings through new packing estimates balance; it is not a measured speedup. Validate with the next complete CI run and retain all selected work and the existing runner caps.
- Refresh profiles when timings drift. Do not automatically learn weights from partial or failed runs, and never use a timing estimate to decide whether a test runs.

## Bootstrap env vars

`scripts/bootstrap.ts`: `PYREON_BOOTSTRAP_SKIP`, `PYREON_BOOTSTRAP_SKIP_NATIVE`, `PYREON_BOOTSTRAP_SOFT`, `PYREON_BOOTSTRAP_FORCE_FAIL`.

## Browser and iOS runner reliability

- All Linux Playwright installs use `bash scripts/install-playwright.sh <engines>`. The OS-dependency timeout runs **inside sudo**, with SIGKILL for the whole process group at the deadline. A runner-owned timeout around Playwright cannot terminate its root-owned apt descendants, leaving a dpkg lock that poisons every retry. A TERM-then-KILL timer can also leave a resistant descendant if its immediate child exits before escalation. Repair interrupted dpkg before retrying or falling back; never remove lock files or kill unrelated package-manager processes.
- Chromium-only setup keeps the fallback to Ubuntu's preinstalled libraries. WebKit/Firefox dependencies and all browser downloads fail hard after bounded attempts. Downloads run as the runner user so they reconcile the restored browser store. Engine suites run only after successful setup; a setup failure already makes the required job red.
- `Test (browser)` has a 35-minute backstop derived from both setup budgets (10 + 16 minutes including retries/repair/download kill grace), test work and shared setup. Keep the outer timeout above the sum when changing any inner budget.
- iOS UI suites target the resolved simulator UDID with parallel testing disabled, so device state (appearance, location, URL delivery) belongs to the device configured by the workflow. Test retries relaunch the runner process. Each app writes a separate `.xcresult` bundle, uploaded after success or failure.
- Deliver deep links through `XCUIDevice.shared.system.open(URL)` in XCUITest, then assert both cold and warm routes. Safari's address bar and confirmation sheet are unrelated dependencies and must not decide whether URL handling is tested. A failed route assertion stays a hard failure.
- `docs.yml` — docs SSG and Atlas build on relevant PRs; deploy only on main pushes. Linux command deadlines cover install (10m), docs (8m), and Atlas (3m), below the 25m job backstop. Explicit Bash preserves the failed producer's status through `tee`. Always upload phase logs and the SSG error artifact before the job backstop; a timed-out command must fail, and a successful rerun does not establish the earlier stall's cause. Google Fonts self-hosting shares a 60s abort deadline across CSS and font bodies.
