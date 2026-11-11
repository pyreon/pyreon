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
- Job-level preflight and aggregate verdicts must also respect cancellation.
  `Test` uses `!cancelled()` so failed prerequisites still produce a verdict,
  while superseded PR runs release their concurrency slot. An `always()` job
  can survive ordinary cancellation and leave the newest run pending.
- Bootstrap build deadlines must settle the runtime, not just the build promise.
  The shared bounded-process helper stops owned POSIX descendants and destroys
  inherited pipes. Bootstrap allows 250ms output drainage after parent exit;
  incomplete drainage fails closed. Windows cleanup targets the direct child.
- Matrices and decide outputs are fail-closed. A detection error runs the full set, because a skipped required check reports success to branch protection.
- Generated-output freshness must reject failed Git comparisons and include
  new unstaged files within the generator-owned paths. Empty stdout alone
  does not prove freshness; unrelated working-tree edits remain outside the check.
- Generated troubleshooting navigation lists categories without persisting entry
  totals. Independent catalog additions must merge into a fresh index without
  conflicts over derived counters; category pages retain every entry and fix.
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
- The local pre-push hook runs only the changed packages' tests, under a time cap (see `.agents/rules/workflow.md`, "Pre-push hook"), so these cells are the ONLY place the reverse-dependency closure is tested before merge. Anything the hook drops must stay covered here or in a required native job.
- `scripts/affected.ts` computes the per-PR package filter. Root configuration, `.github/workflows/ci.yml` and shared-action changes escalate to `--filter=*`. Any OTHER workflow file is a leaf seed for `@pyreon/test-utils` (its tests lint the workflows), so editing `native-device.yml` no longer reruns every package; it still keeps `affected` non-empty, which the E2E aggregator's decide-says-run invariant depends on. E2E and scaffold selectors also cover shared actions.
- `scripts/ci-batch.ts` uses separate `typecheck`, `test`, `e2e`, and `scaffold` profiles. A suite name is not a global cost: `core` E2E and core package tests are different workloads. The profile records measurement provenance. Unknown members still run with a default weight. Small selected workloads use fewer runners; caps remain 3 typecheck, 3 test, 4 E2E, and 3 scaffold batches. All seven scaffold fixtures now fit on one runner (~49s of measured work after removing repeated root bootstrap), avoiding two redundant setups; the cap leaves room for future growth.
- `Test` validates `toJSON(needs)` after its dependencies finish. Install and Fast Gates must succeed; each selected matrix must succeed; only explicitly unselected matrices may skip. Missing, malformed, or contradictory selection outputs fail. Healthy runs make no jobs-API calls. Failed runs request job links once, with a ten-second total deadline; unavailable or stale API data cannot change the failed verdict.
- `scripts/check-ci-fail-fast.ts` statically prevents an expensive job from
  bypassing Fast Gates or a matrix from disabling cancellation.
- `ci-main.yml` runs `Coverage (Full)` and `Coverage (Native)` on push to main. Coverage-infrastructure PRs also run `Coverage (Full)`; native coverage runs on main only. Neither is required, so neither runs in the merge queue.
  Superseded coverage PR runs cancel by PR ref; main runs finish
  and coalesce pending work. The static CI policy gate guards both behaviors.

- Native capability disk caches accept only successful probes. A timeout or signal is a transient failure, never evidence that a compiler or module is absent. Failed legacy probe entries are ignored; interrupted module validation fails and retries on the next call. Required Observation validation fails instead of reporting a successful skip. Genuine SwiftUI absence on non-Apple hosts remains an SDK skip.

## Other workflows

- `pr-gates.yml` — `Changeset` and `Diagnose Catalog`. These are label-sensitive (`skip-changeset`, `skip-diagnose-catalog`), so they live apart from `ci.yml`, whose `pull_request` trigger excludes `labeled` (a label would cancel the in-flight run).
- `native-validate.yml` — `Validate emitted Swift + Kotlin`, `Validate emitted Swift (real-SDK typecheck, macOS)`. Both run when the native path classifier OR the native-compiler dependency graph (`affected.ts --category=native/compiler`) selects them; the device lanes use the path classifier alone.
- `native-device.yml` — `iOS — xcodebuild (Simulator SDK)`, `Android — gradlew assembleDebug`. After the path classifier, a `Native inputs fingerprint` job (PR only, `continue-on-error`) builds every gated app's emit at head and base and keeps only apps whose fingerprint moved; an empty output (failure, timeout) falls back to the classifier. Input contract and tests: `scripts/native-inputs-fingerprint.ts`, `native-inputs-fingerprint.test.ts`. Triggers on `opened`/`synchronize`/`reopened`, not `labeled`: a label event re-ran the whole device build on the same SHA (19 times in two days, 1,086 macOS runner-minutes). The `native-device` label is read on the next push; `gh workflow run native-device.yml --ref <branch>` proves the current commit at once.
- `native-device-nightly-status.yml` (`workflow_run` after `Native Device Build`) — keeps the `[native-device] Nightly device build is RED` sticky issue in step with the scheduled run. It was a job inside `native-device.yml` and put a skipped or cancelled row on every PR.
- `lathe-action-selftest.yml` (advisory) — trigger-level `paths:` filter. A trigger filter is allowed only on advisory workflows; a required one needs the always-running decide job.
- Native lane selection follows package-owned lowering as well as the PMTC
  directories. `native-surface-touched.ts` recognizes plugin source and its own
  selector scripts; `native-plugin-surface.ts` derives the runtime import closure
  from declared plugin exports using Bun alone, before installation. Shared
  helpers and their resolution manifests select every device app. Deleted,
  unreadable or unresolved dependencies, computed imports and CommonJS loads
  fail closed. Ordinary unrelated web source and the JSX compiler's Rust crate
  remain outside this native surface. A changed manifest skips only when both
  current and comparison-base metadata are web-only; PR merge checkouts retain
  both parents so removing a custom plugin declaration still selects the lanes.
- `codeql.yml` — `Analyze (javascript-typescript)`.
- `cancel-conflicting-ci.yml` (push to main + every 30 min):
  - cancels in-flight runs of PRs that became conflicting. GitHub never dispatches for a conflicting PR, but does not stop a run already in flight. Only a definitive `CONFLICTING` is acted on; `UNKNOWN` is skipped; a failed listing aborts.
  - prunes superseded cache generations on main (`scripts/prune-superseded-caches.ts`).
- The Android Gradle dependency cache (`gradle-deps-<os>-<hash of the native examples' gradle files>`) is written ONLY on `main`, ONLY on a restore miss, and its key carries no `run_id` — a run-id suffix once kept four identical ~650 MB copies and pushed the repo to 10.39 of its 10 GB, LRU-evicting the small bootstrap caches every lib-needing job depends on. `gradle-deps-` is a pruned family in `prune-superseded-caches.ts`.
- `required-check-autoheal.yml` — re-runs a required check that landed `cancelled` (at most 2 attempts, with a PR comment). A genuine `failure` is never retried.
- `leak-sweep.yml` (advisory) — least-squares heap slope over the perf-dashboard journeys, dev mode only (counters tree-shake in production). Locally: `bun run perf:leak-sweep`.
- `docs-freshness-guard.yml` (push to main, not a PR check) — reruns `gen-docs` + `docs/scripts/gen-all.ts`. Drift from two concurrent merges reds the offending commit and opens or updates an `auto/docs-regen` fix PR (with a changeset when mcp `api-reference.ts` drifted; automerge when `RELEASE_PAT` is set).
- `published-state.yml` — daily repo-vs-npm check.

## Required checks

Branch protection pins 15 required contexts in two authorities that must stay identical: classic protection and ruleset 19416270. The merge queue rule belongs in the ruleset (see Merge queue).

`Install`, `Fast Gates`, `Build`, `Test`, `Test (browser)`, `Release Build`, `bootstrap-exit-codes`, `Changeset`, `Diagnose Catalog`, `Analyze (javascript-typescript)`, `CodeQL`, the two `Validate emitted Swift…` jobs, `iOS — xcodebuild`, `Android — gradlew`.

## Merge queue

Tried 2026-11-11 and switched off again the same day (ruleset 19416270 has no `merge_queue` rule): with the org's 20-concurrent-job limit and about 120 queued runs, a group's own CI waited in the same line as the PR runs, the oldest group needed more than 5 hours, groups were rebuilt twice, and in 4 hours no PR merged, while the same green PRs merged immediately without the queue. Try it again only with more runner capacity. Prepared, not enabled: `merge_group` events never fire without the rule. Every workflow that owns a required context carries `merge_group`:

| Context | Workflow / job | In a merge group |
| --- | --- | --- |
| `Install`, `Fast Gates`, `Build`, `Test`, `Test (browser)`, `Release Build`, `bootstrap-exit-codes` | `ci.yml` | Full matrix, as on `push: main`. Release Build audits advisories against `merge_group.base_sha` (pre-existing ones warn). Labels are absent, so `skip-release-readiness` does not apply, as on `main`. |
| `Changeset`, `Diagnose Catalog` | `pr-gates.yml` | Skipped: both depend only on the PR's diff and labels, which the PR already passed. |
| `Analyze (javascript-typescript)`, `CodeQL` | `codeql.yml` | Runs. `CodeQL` is posted by code scanning after the upload, so the job cannot skip. |
| `Validate emitted Swift + Kotlin` | `native-validate.yml` `validate` | Runs when the group's diff (`base_sha` → head) selects it, by the PR rules. |
| `Validate emitted Swift (real-SDK typecheck, macOS)` | `native-validate.yml` `validate-swift-typecheck` | Skipped. |
| `iOS — xcodebuild (Simulator SDK)`, `Android — gradlew assembleDebug` | `native-device.yml` | Skipped. |

- macOS and device lanes skip in the queue because they ran on the PR and a macOS slot wait (p90 144 min, 2026-11-10) at the head of the queue would hold every group behind it. The nightly runs re-prove `main`. To run them in the queue, remove the `merge_group` exclusion from their `if:`.
- Concurrency keys must be unique per queue ref: `github.event.pull_request.number` is empty in a merge group, so use `… || github.ref`. Never cancel a merge-group run (`cancel-in-progress` is PR-only everywhere).
- Do not save a cache from a merge group: its ref is deleted, so the entry only evicts others.
- `ci-main.yml` (`Coverage (Full)`, `Coverage (Native)`) has no `merge_group` trigger: neither is required, so in the queue it would cost about 18 runner-minutes per group for a verdict the queue does not read. Main's push run remains the backstop.

Enable (maintainer, one ruleset change):

```bash
gh api repos/pyreon/pyreon/rulesets/19416270 > rs.json
jq '{name, target, enforcement, conditions, bypass_actors, rules: (.rules + [{type: "merge_queue", parameters: {merge_method: "SQUASH", grouping_strategy: "ALLGREEN", max_entries_to_build: 3, min_entries_to_merge: 1, max_entries_to_merge: 5, min_entries_to_merge_wait_minutes: 5, check_response_timeout_minutes: 120}}])}' rs.json > rs-queue.json
gh api -X PUT repos/pyreon/pyreon/rulesets/19416270 --input rs-queue.json
```

- First canary: one docs-only PR (for example a one-line `.agents/` edit). It exercises the full `ci.yml` matrix, CodeQL with its `CodeQL` upload context, the skipped `pr-gates` jobs, the native-validate decide on a group diff and the skipped device lanes, without a 60-minute native lane. Watch that all 15 contexts report on the `gh-readonly-queue/main/…` head before queueing more.
- `SQUASH`: the only allowed method; keeps the required linear history.
- Build concurrency 3: a group costs about 65–85 runner-minutes over about 20 jobs (full `ci.yml`: 18 jobs, 57–61 min; CodeQL 4; Linux native validate 18 when selected). Three groups at their widest take most of the 20 org slots.
- Merge limits 1–5 with a 5-minute wait: about 25 merges a day; a busy hour batches 2–5 PRs into one full run.
- Timeout 120 minutes: a full `ci.yml` run takes 10–24 min on idle runners and up to 64 under load (2026-11-10); Linux job queue p90 was about 100 min.
- Contributors: the merge button becomes "Merge when ready"; auto-merge (`gh pr merge N --auto`) adds the PR to the queue once its checks pass. A group that fails removes its PR with a comment; fix, push, re-queue. `strict` stays off.
- Changesets: the Version PR and `auto/docs-regen` go through the queue like any PR (`gh pr merge --auto --squash` enqueues). The queue's fast-forward of `main` is a normal push, so `release.yml`, `docs.yml`, `docs-freshness-guard.yml` and main CI trigger as before.
- Roll back: `gh api repos/pyreon/pyreon/rulesets/19416270 | jq '{name, target, enforcement, conditions, bypass_actors, rules: [.rules[] | select(.type != "merge_queue")]}' > rs-noqueue.json`, then the same PUT with that file. Queued PRs leave the queue; `merge_group` triggers go dormant again. The UI path is Settings → Rules → Rulesets → main branch protection → "Require merge queue".

### Light PR CI

Inert until the repository variable `PR_CI_MODE` is `light`. Unset, or any other value, is exactly the behaviour above. Purpose: a PR runs about 8 jobs instead of about 30, and the full matrix runs once per merge group and on `main`, so the full verification applies to the merge RESULT (two individually green PRs can break `main` together because protection is non-strict) and costs one run per group, not one per PR.

The switch is `vars.PR_CI_MODE == 'light'` AND `github.event_name == 'pull_request'`. `ci.yml` resolves it once in `Install` (step `Resolve PR CI mode`, output `pr-light`); `native-validate.yml` reads the variable inline. A resolver failure leaves `pr-light` unset, which means the full run (fail-closed).

| Job | Normal | Light, on a PR | Light, in the queue / on `main` | Why |
| --- | --- | --- | --- | --- |
| `Install`, `Fast Gates`, `Test` (aggregator) | runs | runs | runs | cheap, and everything else hangs off them |
| `typecheck (…)`, `test (…)` cells | affected-filtered | same | full | already affected-filtered on a PR; the unit tests are the main PR signal |
| `bootstrap-exit-codes` | only when `bootstrap.ts` changed | same | same | rare and about 8 min at most |
| `Changeset`, `Diagnose Catalog` | runs | runs | skipped | functions of the PR diff and labels; a group cannot decide them |
| `Analyze (javascript-typescript)`, `CodeQL` | runs | runs | runs | about 4 min; security feedback stays on the PR |
| `Validate emitted Swift (real-SDK typecheck, macOS)`, `iOS — xcodebuild`, `Android — gradlew` | selected by paths | same | SKIPPED | the PR is their ONLY coverage (the queue skips them), so light mode must not skip them |
| `e2e (…)` | affected suites | skipped | full | HEAVY, runs in the queue |
| `Scaffold Smoke (…)` | when selected | skipped | full | HEAVY, runs in the queue |
| `Build` (verify-modes, budgets, coverage floor, rust equivalence) | code PRs | skipped | full | HEAVY, runs in the queue |
| `Test (browser)` | code PRs | skipped | full | HEAVY (timeout 35 min), runs in the queue |
| `Release Build` | code PRs | skipped | full | HEAVY, runs in the queue |
| `Validate emitted Swift + Kotlin` (Linux) | when the native selectors fire | skipped | when the group's diff selects it | HEAVY (about 18 jobs when selected), runs in the queue |

How `e2e` and `Scaffold Smoke` skip: `Install` reports them as unselected (`e2e-has` / `scaffold-has` = `false`, matrices `[]`), the same path a docs-only PR takes, so `scripts/ci-aggregate.ts` accepts their absence and `Test` stays a real verdict. `Build`, `Test (browser)` and `Release Build` carry `needs.install.outputs.pr-light != 'true'` in their `if:`. Concurrency keys and `cancel-in-progress` are unchanged.

A skipped job reports `skipped`, and a skipped required check counts as passing (GitHub, "Troubleshooting required status checks": a job skipped by a conditional reports Success; a workflow skipped by a trigger filter stays Pending, which is why the required workflows keep unfiltered triggers and skip per job). This guide already relies on the same behaviour for `Changeset` and the device lanes in the queue. NOT verified on this repository in light mode: the first light PR is the proof; see the checklist.

Rules the static gate (`scripts/check-light-pr-ci.ts`, in `validate-fast`) enforces: every workflow that owns a required context has `merge_group`; a job that uses the light condition has `merge_group` and `push` coverage and does not exclude `merge_group` in its own `if:`; a job the queue skips (the table's SKIPPED rows and their `changes` / `fingerprint` helpers) never uses it; a direct `PR_CI_MODE` read is bounded to `pull_request`.

Flip (maintainer). The queue MUST be on first: in light mode a PR's heavy results come only from the queue, so without it a PR would merge with `Build`, `Test (browser)`, `Release Build` and the e2e suites never having run.

```bash
# 1. queue on: the ruleset command under "Enable" above
# 2. then:
gh variable set PR_CI_MODE --body light
```

Roll back (seconds, no code change): `gh variable delete PR_CI_MODE`, then remove the `merge_queue` rule (see "Roll back" above). PRs pick the variable up on their next push or re-run; an already-finished run keeps its result.

First-run checklist, on the first PR after the variable is set:

- `Install` log shows `PR_CI_MODE=light`; the PR shows about 8 jobs and all 15 required contexts are present (green or skipped), none `Expected`.
- `Test` is green with `e2e` and `Scaffold Smoke` absent (it reports unselected, not failed).
- Queue it: the group runs the full matrix and all 15 contexts report on the `gh-readonly-queue/main/…` head. Watch queue wait: a full group is 65-85 runner-minutes; if it starves again (see the 2026-11-11 history above) roll back.
- A PR that breaks only a heavy job merges to the queue and fails there, removing itself with a comment: expect the failure feedback to arrive later than before.
- Known residual risks: the device lanes and macOS typecheck still run per PR (5 macOS slots); the queue skips them; `Coverage` stays main-only.

## Caches

- Downstream `node_modules` restores use the exact lockfile key only. A broad prefix downloads a tree the clean-install fallback must immediately discard to avoid stale peer resolution. The bun tarball cache still uses a prefix safely. The setup action exposes whether it already restored tarballs so scaffold jobs do not download the same store twice.
- Scaffold CI restores this commit's libraries through setup-pyreon, then sets `PYREON_BOOTSTRAP_SKIP=1` for the smoke step. Each temporary app otherwise changes `bun.lock`, invalidates bootstrap's global hash, and rebuilds every package again. This skips only the root bootstrap; generated-app installs, dependency lifecycle scripts, builds and smoke assertions still run. Local scaffold runs keep the default bootstrap behavior.
- `bun-install-cache-<os>-<lockhash>`: `Install` saves it on main. A PR whose `bun.lock` differs from the base saves its own; everyone else only restores.
- The macOS native lanes restore and save the content-addressed verdict store, like their Linux twin.
- Native workers write `.cache/pyreon-native-validate`; Actions archives only `.cache/pyreon-native-validate-archive`. Hydrate before tests and snapshot complete atomic JSON verdict/probe records before every save, including cancellation paths, with `scripts/snapshot-native-verdict-cache.ts`. Preserve both the root compiler store and the `kotlin-runtime/` co-source/runtime store without flattening their namespaces. Every verification step uses the same cache directory and disables reads/writes on the nightly drift run. Workers can outlive a cancelled test step, and GNU tar rejects a directory that changes while it reads. A green cache action can hide a failed upload warning: confirm the log's saved key and the cache API entry. Changing the archived path changes Actions' cache version, so the first run of this format is cold; keep restore/save paths aligned across all native lanes.

## Gate reference

- **Coverage (Full)**: main measures every testable workspace except the native compiler, which retains its separate cached coverage job. Coverage-infrastructure PRs also run the full gate before merging. The four-worker pool is followed by three serial nested-build suites; budget for both phases. The full job has a 35m backstop, a 25m coverage step and a 3m always-run log upload. Each package logs its start and duration, so a partial run identifies work still in flight. Per-package deadlines terminate the owned POSIX process group (TERM, then KILL after 1s) and settle even if inherited pipes stay open. Timed-out/signalled executions fail even after printing a summary. No package thresholds are relaxed. Optional native binaries must not control JavaScript fallback coverage: syntax, live-option and lens assertions run independently, with Rust parity checked additionally when the binary is installed.
- **audit-types** (`bun run audit-types --all --strict`): flags public-interface fields with zero non-type references (typed-but-unimplemented). New HIGH findings block. Fix the runtime, or add to `EXEMPT_FIELDS` in `scripts/audit-types.ts` with a rationale.
- **verify-modes** (`bun run verify-modes`): `vite build` for every example × mode, asserting rendered content, not just a green build. New cells must check content.
- **check-bundle-budgets** / **check-import-budgets**: gzipped main-entry and minimal-import sizes against `scripts/{bundle,import}-budgets.json`, measured on built `lib/` with a `NODE_ENV=production` define. Rebuild each changed package before measuring locally; source-resolving tests and typechecks can pass while these gates measure yesterday's library. Run both size gates after that rebuild. For intentional growth, `--update` and review the diff.
- **check-distribution**: every published package declares `sideEffects`, ships source maps, and excludes the `lib/analysis` bundle report (live `npm pack --dry-run` probe).
- **check-esm-only**: Pyreon ships ESM only. `require` and `default` export conditions are both banned in every published package — `default` lets `require('@pyreon/x')` resolve, which is what the policy forbids. The one exemption is `@pyreon/storybook` (Storybook's preset loader resolves through CJS), pinned by `shipped-preset.test.ts`. Accepted cost: Pyreon is absent from CJS-only toolchains, so `contrib/moltar/` is bun/deno only.
- **check-doc-claims**: numeric claims in docs must match source. The guarded claim sites live in the `checks` table in `packages/tools/cli/src/doctor/gates/doc-claims.ts`. Write exact numbers there, never "33+", and do not restate a count anywhere unguarded.
- **check-license-coverage**: every workspace (packages, examples, docs, contrib) carries the root `LICENSE` byte for byte and declares `"license": "MIT"` (`--fix` copies and normalises). It also scans every runtime dependency of every published package: strong copyleft (GPL/AGPL/LGPL/SSPL/BUSL) fails; weak copyleft (MPL/EPL/CDDL/EUPL) fails unless disclosed in `THIRD-PARTY-NOTICES.md`; a dual licence is classified by its weakest half. An absent install store skips the dependency scan loudly.
- **check-native-coverage**: the registry of every package that should reach iOS/Android, each pinned to how it crosses (`pmtc-lowers` = a representative snippet lowers for both targets with zero warnings; `native-container`; `webview-host`). `check-multiplatform-tier` only proves a story is declared; this proves it is true. Companion `check-native-lifecycle-wiring` requires every native container exposing `start()`/`connect()` to be auto-started by both emits or registered manual with a rationale (a never-called `start()` ships frozen at its initial value).
- **check-manifest-depth**: ratchet on MCP `get_api` density for locked packages.
- **Diagnose Catalog**: a new or edited user-visible error or warning message in `packages/core/{runtime-dom,runtime-server,core,compiler,router}/src/` must be matched by an `ERROR_PATTERNS` entry in `packages/core/compiler/src/diagnose.ts` (an existing one, or one the PR adds), or the PR carries the `skip-diagnose-catalog` label. The gate reads the messages out of the base and HEAD content of each changed file, so a perf-only change or a moved/reformatted message demands nothing. `diagnoseError` + `ERROR_PATTERNS` live in the browser-safe `@pyreon/compiler/diagnose` subpath with no `typescript` import, so the dev error printer can load them client-side. `compiler/src/tests/diagnose.test.ts` bundles the subpath and asserts no TS-API markers.
- **Release**:
  - Changesets fixed group (all packages share one version).
  - `check-release-readiness`: `publishConfig.access`, exact provenance repository identity and fixed-group coverage. The publisher shares the repository check and rejects the whole selected plan before any manifest rewrite or publish if its metadata is missing or mismatched.
  - Native coverage allows a cold verdict cache: a 60-minute measurement ceiling inside a 75-minute job, with per-compile and per-test deadlines still enforced. Stub/compiler changes invalidate cached verdicts.
  - `Release Build` and the publishing workflow reject high-severity locked dependency advisories through `scripts/audit-new-advisories.ts --level high`. On a pull request it also audits the base lockfile (`git show HEAD^1:bun.lock` into a temp dir with a stub `package.json` — `bun audit` reads only the lockfile) and FAILS only on advisories the PR introduces; advisories already on the base become `::warning::` lines, so one new upstream advisory can no longer red every open PR (that froze merges 2026-10-29 → 11-02). On `main` and in the release workflow it stays strict. Non-JSON audit output throws, so the gate fails closed. The wrangler `npm audit` in `Build` follows the same rule: it fails only when the PR changed `scripts/verify-modes-tools/package-lock.json`. The isolated Verify Modes workerd tool installs with `npm ci` from `scripts/verify-modes-tools/package-lock.json` and audits that tree too; update the lock together with its manifest. Its Sharp override pins the patched 0.35.5 transitive dependency while retaining the existing Wrangler runtime version and the high-severity audit.
  - `check-published-state`: every publishable package, not sentinels. A partial release where some packages lag the cut version is red and names each lagging package. Post-publish steps pass `--wait-for-publish`: only successfully submitted packages in the current `publish-result.json` receive a 5m visibility window before full verification; each lookup has a 10s bound and the step has 10m. Daily checks and resume detection stay immediate. This avoids treating npm processing delay as a failed publication.
  - `scripts/publish.ts` retries only npm errors with evidence of being transient (5xx, dropped sockets). Never 404/403/conflict, and never `E422 Error verifying sigstore provenance bundle`, which reproduces on every attempt (a manifest missing `repository` causes it).
  - `release.yml`'s `resume-detect` / `resume-publish` republish lagging packages from the release tag (never main), once per version.
  - A new package's first publish needs a one-time manual OIDC trusted-publisher bootstrap.

## E2E suites

- `bun run test:e2e` plus per-suite `test:e2e:*` scripts in the root `package.json`, real Chromium, `retries: 2` in CI (from `@pyreon/playwright-config`).
- In CI the suites are batched into `e2e (…)` cells by `scripts/ci-batch.ts`.
- `scripts/e2e-affected.ts` forces the FULL suite set for a `scripts/` change only when that script is REACHABLE from an e2e job (`e2eReachableScripts`: a BFS from the e2e configs, specs, shared actions, playwright configs, example/docs build files, the root e2e scripts and ci.yml's `install`/`e2e-suite` jobs, over `scripts/…` mentions and relative imports — 26 files today). Any other `scripts/` file (`native-golden.json`, a budget JSON) selects nothing; only `ci.yml` among workflows forces the full set. If the derivation throws it falls back to the old "any `scripts/` path runs everything" rule. A comment that NAMES a script path makes it reachable, so reword rather than quote a path you do not want to drag in.
- `ui-showcase-regression` covers runtime-dom, styler, rocketstyle, elements and unistyle through a real app. When a real-app regression surfaces in those packages, add a bisect-verified spec there.
- `@pyreon/zero` and `@pyreon/lint` ship large `coverageExclude` lists (integration code gated by e2e / verify-modes). Check the list before "fixing" low coverage.

## Diagnosing slow CI

- Queue vs work per job: `gh api repos/pyreon/pyreon/actions/runs/<id>/jobs`. Exclude `conclusion == "skipped"`. `started_at − created_at` is queue; `completed_at − started_at` is work.
- A wall clock far above summed work, with queue in the hundreds of minutes, is slot starvation.
- Compare work separately from setup and queue time. Per-category and per-suite log groups delimit the work used to refresh `ci-batch.ts` profiles. Replaying old timings through new packing estimates balance; it is not a measured speedup. Validate with the next complete CI run and retain all selected work and the existing runner caps.
- Refresh profiles when timings drift. Do not automatically learn weights from partial or failed runs, and never use a timing estimate to decide whether a test runs.

## Bootstrap env vars

`scripts/bootstrap.ts`: `PYREON_BOOTSTRAP_SKIP`, `PYREON_BOOTSTRAP_SKIP_NATIVE`, `PYREON_BOOTSTRAP_SOFT`, `PYREON_BOOTSTRAP_FORCE_FAIL`, `PYREON_BOOTSTRAP_CONCURRENCY` (builds run at once; default `min(cores, memory ÷ 1.5 GB)` — see below).

## Browser and iOS runner reliability

- Before installing Linux browser dependencies, normalise the runner's Azure Ubuntu archive URLs to `https://archive.ubuntu.com` in `/etc/apt/sources.list`, every active `.list` or `.sources` file, and the local mirror lists those entries reference through `mirror+file:`. GitHub runners use `/etc/apt/apt-mirrors.txt`, so rewriting only source URLs leaves Azure selected. APT reads both formats; leaving one Azure entry active can stall `apt-get update` even while the official archive responds. Preserve suites, components and signing options. `set-ci-apt-mirror.ts` and the real install-entry regression cover mixed source formats, idempotence and failed setup.

- All Linux Playwright installs use `bash scripts/install-playwright.sh <engines>`. The OS-dependency timeout runs **inside sudo**, with SIGKILL for the whole process group at the deadline. A runner-owned timeout around Playwright cannot terminate its root-owned apt descendants, leaving a dpkg lock that poisons every retry. A TERM-then-KILL timer can also leave a resistant descendant if its immediate child exits before escalation. Repair interrupted dpkg before retrying or falling back; never remove lock files or kill unrelated package-manager processes.
- Chromium-only setup keeps the fallback to Ubuntu's preinstalled libraries. WebKit/Firefox dependencies and all browser downloads fail hard after bounded attempts. Downloads run as the runner user so they reconcile the restored browser store. Engine suites run only after successful setup; a setup failure already makes the required job red.
- `Test (browser)` has a 35-minute backstop derived from both setup budgets (10 + 16 minutes including retries/repair/download kill grace), test work and shared setup. Keep the outer timeout above the sum when changing any inner budget.
- iOS UI suites target the resolved simulator UDID with parallel testing disabled, so device state (appearance, location, URL delivery) belongs to the device configured by the workflow. Test retries relaunch the runner process. Each app writes a separate `.xcresult` bundle, uploaded after success or failure. The exact `.ci-ios-results/*.xcresult` upload must enable hidden files because its result root starts with a dot; a completed or failed selected UI step with no matching results is an error, while entirely skipped app lanes do not upload.
- Deliver deep links through `XCUIDevice.shared.system.open(URL)` in XCUITest, then assert both cold and warm routes. Safari's address bar and confirmation sheet are unrelated dependencies and must not decide whether URL handling is tested. A failed route assertion stays a hard failure.
- `docs.yml` — concurrency cancels superseded PR builds but never a running `main` deploy (pending ones coalesce to the latest); cancelling the running deploy left pyreon.dev un-deployed for 7.5 h on 2026-11-10 while each run waited about an hour for a runner. Docs SSG and Atlas build on relevant PRs; deploy only from `main` (push, a daily 00:05 UTC schedule that publishes future-dated blog posts on their date, or a manual dispatch). Upload and deploy share one condition, `event_name != 'pull_request' && ref == main`; a PR never deploys. Linux command deadlines cover install (10m), docs (8m), and Atlas (3m), below the 25m job backstop. Explicit Bash preserves the failed producer's status through `tee`. Always upload phase logs and the SSG error artifact before the job backstop; a timed-out command must fail, and a successful rerun does not establish the earlier stall's cause. Google Fonts self-hosting shares a 60s abort deadline across CSS and font bodies. The site publishes the repo-root generated `llms.txt` / `llms-full.txt` at its root (`docs/vite-plugins/publish-llms-txt.ts`); a step fails the build unless `docs/dist` holds both byte-identical, and both files are in the workflow's path filters so a manifest-only change redeploys them.
