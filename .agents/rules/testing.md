# Testing Rules

Environment choice (happy-dom vs real browser vs e2e) and browser smoke tests live in `.agents/rules/test-environment-parity.md`.

## Runner and configs

- Run `bun run test` (all packages) or `bun run --filter='@pyreon/<pkg>' test`. Never `bun test` — the suites are vitest.
- Every package `vitest.config.ts` uses `defineNodeConfig` from `@pyreon/vitest-config`; every `vitest.browser.config.ts` uses `defineBrowserConfig`. They apply the shared base in one fixed merge order: 20s `testTimeout`, CI `retry: 2`, the bun condition, and per-category coverage defaults. Hand-rolled `mergeConfig` chains are rejected by the lint rule `pyreon/vitest-config-uses-shared`. Shape: `defineNodeConfig({ category: 'core' | 'fundamentals' | 'ui' | 'tools' | 'zero' | 'internals', environment: 'happy-dom' })`. See `packages/internals/vitest-config/README.md`.
- The root `vitest.config.mts` is a router, not a config: its `test.projects` maps every package and example config, so `bunx vitest run <path>` from the root runs each file under its own package's config (otherwise it would run on vitest defaults — 5s timeout, parallel files). `packages/internals/test-utils/src/tests/root-vitest-projects.test.ts` asserts the mapping is total.
- Vitest globals are on; do not import `describe`/`it`/`expect`/`vi`.
- Every root-level Playwright config uses `definePlaywrightConfig` from `@pyreon/playwright-config`. It supplies `testDir: './e2e'`, `retries: process.env.CI ? 2 : 0`, headless Chromium, and per-webServer `reuseExistingServer: !process.env.CI` plus a default timeout. A project's `port` becomes its `baseURL`; use `viteDevServer(filter, port)` for the common dev-server boot and a raw `{ command, port, cwd?, env?, timeout? }` for anything else. The package (private) exports `src/index.ts` under a `default` condition because Playwright's config loader resolves through Node CJS. See `packages/internals/playwright-config/README.md`.

## Organization

- Tests live in `packages/<cat>/<name>/src/tests/` as `*.test.ts(x)`; real-browser tests are `*.browser.test.ts(x)` anywhere under `src/`.
- Name a test file after the module it tests (`signal.test.ts` for `signal.ts`).
- Group with `describe` by feature, one case per `it`.
- In happy-dom, `typeof window !== 'undefined'` is always true, so SSR-only branches need a node-environment test file.

## Coverage

Two layers enforce coverage:

- **Vitest thresholds** (a package's own `bun run test` fails below them). Defaults come from `CATEGORY_DEFAULTS` in `packages/internals/vitest-config/src/thresholds.ts`: core and internals 90 on all four metrics; fundamentals 85/80/85/85; ui, tools, zero 80/75/80/80 (statements/branches/functions/lines). A `coverageThresholds` override merges over the category default.
- **`scripts/check-coverage.ts`** (the `Coverage` gates). Reads each package's declared thresholds; an undeclared metric counts as 95 (`DEFAULT_THRESHOLD`), and 95 is also the floor. A package below the floor needs an explicit threshold plus a `BELOW_FLOOR_EXEMPTIONS` entry with the reason.

Rules:

- **Declare every metric the package does not meet.** A partial override leaves each omitted key at the default, which you are then claiming without having measured it. A partial override reads as "thresholds are set", so reviewers stop looking.
- **Classify a real shortfall before acting.** It is one of: an accounting artifact (a file covered only by a `*.browser.test.*` → add to `coverageExclude` naming the covering suite; never exclude a file covered nowhere), a cheap real gap (write the test), or an honest re-baseline (declare the measured value plus a `BELOW_FLOOR_EXEMPTIONS` entry). Floors only tighten.
- **Exclude lists drift when the files they name move.** When you split or rename a directory, grep coverage excludes, lint scopes and gate allowlists that name it.
- V8 counts both sides of `??`, `||` and ternaries. Use `as Type` or `!` on provably-safe paths to avoid uncoverable branches.
- A module-level capture (`const _isBrowser = typeof window !== 'undefined'`) moves a branch from per-call to module-load time.
- Run: `cd packages/<cat>/<name> && bun run test -- --coverage`.

## Test the shipped entry, not the export

Unit tests call the exported function; users run a bin, a Dockerfile `CMD`, a platform-mandated output path or a scaffolded config. Bugs in that gap survive every unit test (a published bin that was a no-op; a Dockerfile `CMD` naming a file no adapter emits; an adapter writing output where the platform never looks, with a test that read back the path the adapter chose).

- Any shipped entry point needs a test that exercises the entry itself. Reference: `packages/tools/lint/src/tests/bin-invokes-cli.test.ts` spawns the real bin.
- For spawned processes, assert exit codes only. Captured stdout is non-deterministic under parallel load (see "Subprocess testing as a default" in `.agents/rules/anti-patterns.md`).
- Assert paths against the producer's exported constants, never a literal retyped in the test. `packages/zero/zero/src/adapters/contract.ts` (`*_ADAPTER_OUTPUT`) is keyed on by both the adapters and `create-zero`'s scaffolded configs.
- Guard a suite that needs a built artifact with `hasBuiltLib(path, what)` from `@pyreon/test-utils/built-lib`, not a bare `existsSync`. It skips loudly in a fresh worktree (no `lib/`) and throws under `PYREON_REQUIRE_BUILT_LIB=1`, which the CI test cells set because they guarantee `lib/`. A skipped suite must never pass as coverage.

### A spawn-based test reads `lib/`

A test that spawns a package's `bin` runs the built output, so a source edit is invisible until `bun scripts/bootstrap.ts` rebuilds — and the suite stays green against the previous behaviour. Run such suites after a bootstrap; the bisect recipe is edit source → bootstrap → run. The same holds for tests that assert on `lib/` bytes or boot a nested Vite SSR build (the "lib-needing" category in `.agents/guides/ci/README.md`). Mark the `BIN` constant in such a file with a comment saying so.

## A registry needs a per-item "fires" proof

A rule, detector or codemod that reports nothing passes every structural test (unique ids, grouping, total count). A count assertion only detects that an item was added; the reader's fix is to bump the number, and an inert item ships green.

For every item, assert:

1. a fixture that must produce that item's diagnostic, and
2. a corrected counterpart that must produce nothing from it (without this, an item that reports unconditionally passes).

Enable only the item under test so a neighbour cannot stand in for it, and assert the fixture map is total over the registry so a new item fails until it proves it fires. Reference: `packages/tools/lint/src/tests/rule-fires.test.ts`.

## A test that encodes the bug is worse than no test

Specs can assert broken behaviour (a `??` that swallowed an explicit `null`; an adapter output asserted at the wrong path; `props.children` compared to an eagerly-read value). When an existing test blocks your fix, find the invariant it protects, keep that invariant, rewrite only the assertion, and say so in the PR body.

## Timeouts and CI-only failures

Reference: `packages/fundamentals/sync/src/tests/ws-relay.test.ts`.

- **The wall-clock backstop must exceed the composed internal budgets.** A test that awaits three sequential `waitFor`s needs a vitest timeout above three budgets, or vitest kills it with an opaque "test timed out" that hides the descriptive error.
- Use one constant (`WAIT_BUDGET_MS`) for both the `waitFor` default and the backstop, and derive the backstop: `MAX_SEQUENTIAL_WAITS × WAIT_BUDGET_MS + headroom`, set once at `describe` level (`describe(name, { timeout }, fn)`). Per-test magic-number overrides fall below the sum as soon as the budget grows.
- Prove a timeout option is applied by forcing it to `1` and seeing `Test timed out in 1ms`.
- A load-dependent flake is usually not locally reproducible. State the structural argument as the proof instead of claiming a repro.
- **The failure message is the only artifact of a CI-only failure.** Give every wait a name and a state snapshot:

  ```ts
  await waitFor('both transports synced', () => ta.synced() && tb.synced(), {
    describe: () => `ta.synced=${ta.synced()} tb.synced=${tb.synced()} …`,
  })
  // → waitFor: timed out waiting for both transports synced — observed: …
  ```

  - `describe` is a thunk evaluated only on failure, so it costs nothing on the passing path.
  - Wrap the `describe()` call in try/catch; a throwing snapshot turns a diagnosable timeout into an opaque one.
  - Force a timeout once and read the message; an unseen diagnostic is a guess.

  This applies to any assertion that fails only remotely (CI, device, load): print the observed state, not just the expectation.

## `mountInBrowser` takes a VNode

`mountInBrowser(() => Comp(props))` passes a function child, i.e. a general reactive accessor, which runs twice at mount (untracked classification sample, then the tracked bind). The sampled instance is never mounted, but its setup already ran, so its effects, observers and timers are live. Use `mountInBrowser(h(Comp, props))` whenever the component owns a timer, observer or subscription.

## Bisect-verify regression tests

Mandatory for every regression test:

1. Save the fix.
2. Revert the fix temporarily.
3. Run the test; it must fail with the expected error.
4. Restore the fix.
5. Run the test; it must pass.

If step 3 passes, the test is not load-bearing (for example, a minifier can fold dead code regardless of the gate under test). Record the result in the PR description: "Bisect-verified: reverted to broken, test failed with `<error>`, restored, test passed."

### Dev-server e2e

Vite's config bundler resolves plugin packages (`@pyreon/vite-plugin`, `@pyreon/zero`) through the `node` condition, i.e. `lib/`. A source edit to plugin code is invisible to a running dev server until `lib/` is rebuilt (user-runtime code loaded through `ssrLoadModule` does reload from `src/`). Locally, `reuseExistingServer` also reuses a stale server.

1. Save the fix, then revert the source.
2. `bun run --filter='@pyreon/zero' build` (and any other plugin package you edited).
3. Kill the dev server: `lsof -ti tcp:<port> | xargs -r kill -9`.
4. `bunx playwright test --project=<name> --grep "<spec>"` — it must fail.
5. Restore the fix, repeat steps 2–3, re-run — it must pass.

Skipping steps 2–3 makes the spec pass against the old built code. Any new package that runs inside Vite's plugin chain follows the same recipe.

### Never bisect an env-hygiene guard with the hostile variable exported

Tests that shell out to `git` must strip `GIT_*`, because those variables override `cwd` and `-C`. Do not prove that guard by reverting it and exporting `GIT_DIR`/`GIT_INDEX_FILE`: the fixture's `git init`/`add`/`commit` then run against the real repository and can commit a deletion of the whole worktree onto your branch (recoverable via `git reflog` only if unpushed). Instead:

- run the reverted state in a throwaway clone (`git clone --depth 1 . /tmp/x`), or
- assert the mechanism with the guard in place (`process.env.GIT_DIR` is undefined in the test; `git rev-parse --git-dir` reports the fixture repo), and
- run the fixed suite with the hostile variable exported — green there is the claim you want.

When a guard's failure mode damages something outside the test, never run the bisect where that thing is real.

### Dependency-version bisect

Bun's incremental install can leave stale peer-hash directories in `node_modules/.bun`, so the resolved version disagrees with the lockfile. Local-pass/CI-fail on an identical commit is the signature. For each step:

1. Edit the version (package.json / overrides).
2. `mv node_modules /tmp/<trash-N>` (neither a plain `bun install` nor `bun install --force` clears stale peer-hash dirs).
3. `bun install`.
4. Verify the resolved link: `readlink node_modules/.bun/<consumer>@<ver>*/node_modules/<dep>` must point at the version under test. If it disagrees with the lockfile, the data point is invalid.
5. Run the failing suite.

## Cross-tab Playwright specs against Vite dev

When a spec opens a second tab (`context.newPage()`) against a Vite dev server, the new client can trigger an HMR update that reloads tab 1 and destroys listeners the test registered (`storage` events, window globals, signal subscriptions). Symptoms: `page.waitForFunction` timeouts or "Execution context was destroyed". Suppress the HMR client for the whole context:

```ts
test.beforeEach(async ({ context }) => {
  // context.route covers tabs opened mid-test; page.route would miss tab 2.
  await context.route('**/@vite/client*', (route) => route.fulfill({ status: 204, body: '' }))
})
```

- Apply it only to multi-tab specs that rely on long-lived per-page listeners.
- Do not apply it to click-driven specs: suppressing `@vite/client` also breaks click delegation in the fundamentals-playground dev build. `networkidle` suffices for single-tab read-and-update.
- References: `e2e/fundamentals/storage.spec.ts` (suppressed, no clicks) vs `e2e/fundamentals/storage-hydration.spec.ts` (clicks, no suppression).
- The race is load-dependent and does not reproduce locally; the structural argument is the proof.

## The native compile-validation suite is verdict-cached

`@pyreon/native-compiler`'s `validate.ts` spawns real `swiftc`/`kotlinc`. Verdicts are content-addressed on disk (`validate-cache.ts`), keyed on validator kind, compiler version, exact stub text and the exact bytes compiled. The full suite runs about 397s uncached and about 6s warm.

Kotlin cache misses are served by one warm compiler JVM per run (`src/kotlin-daemon.ts`): the package's `globalSetup` starts it and passes its spool directory to workers via `PYREON_KOTLIN_DAEMON_SPOOL`. Every failure path falls back to per-check `kotlinc`; `kotlin-daemon.test.ts` asserts both paths agree on accepted and rejected emits. `PYREON_KOTLIN_DAEMON=0` forces the plain path — use it when you distrust a verdict.

- A timing claim in this package is meaningless without the cache state. Compare warm with warm, or both with `PYREON_VALIDATE_NO_CACHE=1`.
- The key is the bytes handed to the compiler, not the caller's `source`. `validateSwiftTypecheck` and `validateSwiftWithStubs` transform before compiling; if you add a transform, key on its output or the cache serves stale verdicts.
- Editing a stub file invalidates correctly, because stub text is in the key. A stale `ok` after a stub edit would mask real breakage.
- A fast re-run is not a failed invalidation: after a Swift-only key change, `kotlinc` verdicts legitimately still hit. Check which keys should have moved.
- `PYREON_VALIDATE_NO_CACHE=1` bypasses both tiers; `PYREON_VALIDATE_CACHE_DIR` relocates the store (CI restores it).
- The nightly `schedule` run is deliberately uncached, to catch a new compiler release changing strictness.
- Vitest runs files in parallel, so do not estimate per-file costs serially; that overstates wins by about 10×.
