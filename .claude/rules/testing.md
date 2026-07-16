# Testing Rules

## Test Runner

- Use `bun run test` to run all package tests (runs `bun run --filter='./packages/*' test`)
- Each package's `vitest.config.ts` MUST use `defineNodeConfig` from `@pyreon/vitest-config`. Browser configs MUST use `defineBrowserConfig`. Both helpers enforce the canonical merge order by construction — `testTimeout: 20_000` + CI `retry: 2` + bun condition + per-category coverage defaults all flow through one canonical merge. Hand-rolled `mergeConfig` chains are forbidden (enforced by lint rule `pyreon/vitest-config-uses-shared`). Pre-migration history (PRs #914-#922): 87 configs mixed three merge-order patterns; 9 silently ran on vitest's 5s default timeout because `sharedConfig` ended up on the wrong side of `mergeConfig`. Canonical shape: `defineNodeConfig({ category: 'core' | 'fundamentals' | 'ui' | 'tools' | 'zero' | 'internals', environment: 'happy-dom' })` — see [`packages/internals/vitest-config/README.md`](../../packages/internals/vitest-config/README.md) for the full surface.
- Vitest globals enabled — no need to import `describe`, `it`, `expect`, `vi`
- Each root-level `playwright.*.config.ts` MUST use `definePlaywrightConfig` from `@pyreon/playwright-config` (the Playwright sibling of `@pyreon/vitest-config`). It bakes the shared defaults — `testDir: './e2e'`, `retries: process.env.CI ? 2 : 0`, `use: { headless, browserName: 'chromium' }`, per-webServer `reuseExistingServer: !process.env.CI` + default `timeout` — so each config states only its projects + webServers. A project's `port` becomes its `use.baseURL`; the dominant `bun run --filter=… dev -- --port … --strictPort` webServer is `viteDevServer(filter, port)`; bespoke boots (build-then-serve SSG, `node …/vite`) pass a raw `{ command, port, cwd?, env?, timeout? }` entry. The package exports `src/index.ts` under a `default` exports condition because Playwright's config loader resolves via Node CJS (no build step — Playwright transpiles the workspace `.ts` directly). See [`packages/internals/playwright-config/README.md`](../../packages/internals/playwright-config/README.md). (The root `vitest.shared.ts` is gone — absorbed into `@pyreon/vitest-config/src/internals.ts` in #914; there is no root-level vitest config.)

## DOM Testing

- Packages `runtime-dom`, `router`, `head`, `react-compat`, `preact-compat`, `vue-compat`, `solid-compat` use `environment: "happy-dom"`
- happy-dom means `typeof window !== "undefined"` is always true — SSR-only branches are unreachable in tests
- Use `document.createElement`, `container.innerHTML`, etc. directly in tests

## Coverage

- **Enforced contract**: `@vitus-labs/tools-vitest`'s `createVitestConfig()` sets a **90% global threshold** on all 4 metrics (statements, branches, functions, lines). A package whose coverage drops below 90% on ANY metric makes its own `bun run test` exit non-zero — that is the real, blocking gate. >95% is the **aspiration**, not a guaranteed invariant: coverage drifts as code is added without matching tests, and the threshold (not 95%) is what actually blocks. Treat a package below 95% as a hardening opportunity; treat one below 90% as a RED gate to fix now. (Example: `@pyreon/reactivity` — the foundation package every other depends on — had drifted to 87.38% branches and its test command was exiting 1 until the coverage-hardening PR brought it to ≥90% on all 4.)
- V8 coverage counts branch sides for `??`, `||`, ternary — use type assertions (`as Type`) or `!` for provably-safe paths to avoid uncoverable branches
- Module-level const captures (e.g., `const _isBrowser = typeof window !== "undefined"`) move branches from per-call to module-load time
- Run coverage: `cd packages/<name> && bun run test -- --coverage`

## Test the shipped ENTRY, not the export

Unit tests call the exported function; nothing runs the thing users actually run. The 2026-07 release audit found three bugs that survived **every** release in that blind spot:

- **`pyreon-lint`'s bin was a total no-op in every published version.** `bin/pyreon-lint.js` was a bare `import('../lib/cli.js')`, and the built `lib/cli.js` is a pure re-export — `src/cli.ts`'s `if (import.meta.main) main()` self-run guard does not survive the library build (rolldown drops it, and inside a bundled chunk `import.meta.main` is never true). All 1058 unit tests were green because they call `runCli()` directly.
- **Every scaffolded Docker deploy was broken since inception** — the Dockerfile ran `node dist/server.js`, a file **no adapter has ever emitted** (node emits `dist/index.js`). Nothing built the image or compared the `CMD` against the adapter's real output.
- **The Vercel adapter wrote `.vercel/output` inside `outDir`**, where Vercel never looks (a dead config whose cache-header routes never applied). Its unit tests asserted the file existed *at the path the adapter chose* — a test that reads the path the code picked can only ever confirm the code agrees with itself.

Rules:

- Any shipped ENTRY POINT — a `bin`, a Dockerfile `CMD`, a platform-mandated output path, a scaffolded config — needs a test that exercises the ENTRY, not the library function behind it. `@pyreon/lint`'s `bin-invokes-cli.test.ts` is the reference: it SPAWNS the real bin.
- **Assert exit codes only** for spawned processes. Captured stdout is non-deterministic under parallel load (see anti-patterns "Subprocess testing as a default").
- **Assert paths against the producer's exported constants**, never a literal re-typed in the test. `@pyreon/zero`'s `adapters/contract.ts` (`*_ADAPTER_OUTPUT`) exists for exactly this: the adapters AND `create-zero`'s scaffolded configs key off it, so drift fails a test instead of a deploy.
- If a suite has a "skip when the artifact is missing" guard, add a loud assertion that the artifact IS present in this environment — a skipped suite must never masquerade as coverage.

## Timeouts: the wall-clock backstop must exceed the composed internal budgets

A per-test timeout sized against ONE internal deadline is wrong the moment a test awaits two. `sync/ws-relay.test.ts` flaked on loaded runners while passing locally in <1s: vitest's 20s default was sized for one 15s `waitFor`, but `RECONNECTS with backoff` awaits **three sequentially** (45s of budget). Worse, its tick-counted deadline is deliberately *starvation-tolerant* (it counts SCHEDULED ticks, so it self-extends when the event loop is starved — exactly the CI condition it exists for), pushing its wall-clock past 20s while its own budget is still unspent. vitest's wall clock always won and killed the test with an **opaque** "test timed out", hiding the descriptive `waitFor: timed out`.

**Fixed 2026-07 (`fix/ws-relay-timeout-backstop`), after four prior incremental-bump PRs (#1512/#1559/#2161/#2190) kept getting outrun.** The residual bug was a **drift**: the backstop formula still used a stale `15_000` per wait while the `waitFor` default had been bumped to `20_000` — so `RECONNECTS with backoff` (3 real 20s waits = 60s composed) got `TEST_TIMEOUT_MS = 15_000×3 + 15_000 = 60_000`, EQUAL to its sum → the opaque-kill hazard was still live for that spec. Meanwhile the internal 20s budget itself was too small: "two clients converge" surfaced the *descriptive* `waitFor: timed out` (backstop worked there) because a localhost WS frame arrived >20s late under contention. The fix has two structural halves:

- **Single source of truth for the per-wait budget.** ONE constant (`WAIT_BUDGET_MS`) feeds BOTH the `waitFor` default AND the backstop derivation, so they can never drift again. The recurring flake was really "bump the budget, forget to re-derive the backstop"; making the backstop *track* the budget retires that cycle. Kill any per-test magic-number override (`}, 50_000)`) — those silently fall BELOW the composed sum the moment the budget grows, re-introducing the exact bug.
- **Derive the backstop** (`MAX_SEQUENTIAL_WAITS × WAIT_BUDGET_MS + setup/teardown headroom`); do not guess it. One describe-level backstop sized for the worst-case spec (`RECONNECTS`: 3 waits) covers the whole file — no per-test overrides.
- **Give the internal budget real headroom, in the ONE place.** Escalation history: 8s → 15s → 20s all flaked (each outrun in turn). Now `WAIT_BUDGET_MS = process.env.CI ? 30_000 : 8000`; the CI backstop is `3 × 30_000 + 15_000 = 105_000`. Note the tick deadline does NOT self-extend in the dominant flake shape ("frames late, timers on time" = no loop starvation), so the budget is a straight wall-clock ceiling for frame arrival — size it accordingly.
- `describe(name, { timeout }, fn)` IS honored in vitest 4 — prove the option is applied (not silently ignored) by temporarily forcing `timeout: 1` and confirming `Test timed out in 1ms`. (Verified for this fix: forcing `TEST_TIMEOUT_MS = 1` → `Error: Test timed out in 1ms.` on "two clients converge".)
- A load-dependent flake is usually **not locally reproducible**. Per the "Cross-tab Playwright specs" precedent below, the structural argument is the bisect proof — state that honestly instead of claiming a repro you don't have. Here: the backstop was `60_000` for the 3-wait spec (== its composed sum, violating "must EXCEED"), and the 20s internal budget was demonstrably outrun (the descriptive error fired); the fix makes the backstop `105_000` (> the `90_000` worst-case sum, +15s headroom) with a `30_000` budget, all tracking one constant.

## A test that encodes the bug is worse than no test

Three specs in the audited releases asserted the broken behavior, so they could never catch it:

- `getValues()` "falls back to initial when nullish" — codifying the `??` that silently swallowed an explicit `null` from the submit payload.
- vercel's "does NOT copy dist files into `static/`" and "emits `.vercel/output/config.json`" — both asserting the tree lives under `dist`, i.e. exactly where Vercel ignores it.
- `Text.test.ts`'s `expect(result.props.children).toBe('label text')` — comparing against the resolved VALUE, which only passes while `children` is eagerly read (the frozen reactive-prop bug).

When an existing test blocks your fix, do not assume the fix is wrong — but do not blindly rewrite the test either. Ask what invariant it was protecting, KEEP that invariant, and rewrite only the assertion to the corrected truth; then say so explicitly in the PR body. (For vercel, the real invariant was "adapters copy, never move, or user post-build steps break". Only the destination changed — so the new spec asserts copied-to-projectRoot AND `outDir` untouched AND nothing written inside `dist`.)

## Test Organization

- Test files live in `packages/<name>/src/tests/` as `*.test.ts` or `*.test.tsx`
- Name test files after the module they test (e.g., `signal.test.ts` for `signal.ts`)
- Use `describe` blocks to group by feature, `it` blocks for individual cases

## Dev-server bisect

When bisect-verifying an e2e spec that runs against a Vite dev server (anything under the `examples/{ssr-showcase,fundamentals-playground,…} dev` webServer in `playwright.config.ts`), reverting source alone is NOT enough.

**Why.** Vite's own config bundler hardcodes `conditions: ["node"]` — it resolves Pyreon plugins (`@pyreon/zero`, `@pyreon/vite-plugin`) via the `node` condition, which points at `packages/zero/zero/lib/`, not the `bun` condition's `src/`. So a `git stash` (or any edit) on `src/vite-plugin.ts` is invisible to the running dev server until `lib/` is rebuilt. The bun-condition path applies to user-runtime code loaded via `ssrLoadModule` (`@pyreon/zero/server`, `@pyreon/runtime-server`, `@pyreon/core`, etc.) — those DO hot-reload from `src/`.

**Recipe to bisect-verify a dev-mode e2e spec**:

1. Save the fix.
2. Revert the source (stash, checkout, edit, whatever).
3. `bun run --filter='@pyreon/zero' build` (and any other plugin package you edited). ~10s for zero.
4. Kill the running dev server: `lsof -ti tcp:5175 | xargs -r kill -9` (substitute the project's port).
5. `bunx playwright test --project=<name> --grep "<spec>"` — assert it fails with the right error message.
6. Restore the fix.
7. Rebuild lib + kill server again (steps 3-4).
8. Re-run the spec — assert it passes.

**Without steps 3 + 4, the test will silently pass against the OLD (built) code, giving a false-negative bisect verification.** Caught originally in M1.2: a stash-then-run produced "test still passes" results for 3 iterations before realizing `lib/vite-plugin-*.js` still carried the fix. The recipe was added to `.claude/rules/testing.md` to prevent the same trap.

**`playwright.config.ts` has `reuseExistingServer: !process.env.CI`** — locally, if port 5175 is already in use, playwright reuses the existing server. So step 4 (kill the server) is mandatory in iterative bisect cycles; the auto-reuse will otherwise serve from the stale boot.

**Applies to**: any package whose code runs inside Vite's plugin chain. Today that's `@pyreon/vite-plugin` and `@pyreon/zero`. Adding a new plugin package: document its bisect-bisect-rebuild cycle here.

## Dependency-version bisect — never trust an incremental bun layout

When bisecting an EXTERNAL dependency version (edit package.json → `bun install` → run tests → flip → repeat), bun's incremental install can leave STALE peer-hash instance dirs in `node_modules/.bun` with stale internal symlinks — so the on-disk resolution silently disagrees with the lockfile. The 2026-07 deps-update PR produced a fully wrong culprit attribution this way: every local "pass" ran vitest linked against `vite@8.0.16` while the lockfile (and CI's fresh install) resolved 8.1.5 — the variable under test never actually flipped, and vitest 4.1.10 was blamed for a failure vite 8.1.5 caused. Local-pass/CI-fail on an identical commit is the signature of this trap.

Recipe for each bisect step:

1. Edit the version (package.json / overrides).
2. `mv node_modules /tmp/<trash-N>` (a plain `bun install` after an in-place edit is NOT sufficient; neither is `bun install --force` — both preserved the stale peer-hash dirs when this was hit).
3. `bun install`.
4. **Verify the RESOLVED link before trusting the run**: `readlink node_modules/.bun/<consumer>@<ver>*/node_modules/<dep>` must point at the version you think you're testing.
5. Run the failing suite.

A cheaper mid-cycle sanity check when a full clean install is too slow: step 4 alone — if the link disagrees with the lockfile, the layout is stale and the data point is invalid.

When a Playwright spec opens a second tab via `context.newPage()` against a Vite dev server, the second tab's `page2.goto('/')` is seen by Vite as a new client connecting. Vite's pre-bundle / module-graph traversal sends an HMR update to **all** connected clients (including tab 1) over the `@vite/client` WebSocket. Tab 1 then reloads — destroying any `addEventListener('storage', …)` / `window.<global>` / signal subscriptions the test body just registered. The spec then times out at the assertion that depended on the destroyed listener.

This isn't theoretical: `e2e/fundamentals/storage.spec.ts:cross-tab localStorage sync` flaked four consecutive main-branch CI runs (25745360432 / 25728248892 / 25725838841 / 25723298232) with `TimeoutError: page.waitForFunction: Timeout 5000ms exceeded` (later variant) or `Error: page.evaluate: Execution context was destroyed, most likely because of a navigation` (earlier variant). PR #535 added `waitForLoadState('networkidle')` + a `window.__storageSync` poll as defenses; the underlying race still fired. PR #544 fixed it by killing the HMR client outright.

**Recipe** for cross-tab specs against Vite dev:

```ts
test.beforeEach(async ({ page, context }) => {
  // Kill Vite's HMR client for every page in this context. `context.route`
  // propagates to every new page (including tabs opened mid-test), so the
  // suppression covers `page2 = await context.newPage()` too — per-page
  // routes registered on `page` alone would miss tab 2.
  await context.route('**/@vite/client*', (route) =>
    route.fulfill({ status: 204, body: '' }),
  )
  // ... rest of setup
})
```

Without `@vite/client`, neither tab opens the HMR websocket — no HMR updates, no reloads, no listener destruction. The dev server still serves the rest of the bundle normally.

**Don't apply this guard to specs that drive the page via real clicks.** Suppressing `@vite/client` ALSO breaks click-handler delegation in the fundamentals-playground dev build (initial render works but events don't fire post-mount). Specs that drive the page via Playwright's `.click()` need HMR alive. `networkidle` alone is sufficient for the same-tab read-and-update path; the cross-tab listener-destruction race only fires when a second `goto` happens. Reference: `e2e/fundamentals/storage.spec.ts:beforeEach` (HMR-suppressed, no clicks) vs `e2e/fundamentals/storage-hydration.spec.ts:beforeEach` (no suppression, clicks-driven).

**Local bisect can't reproduce the flake.** The race is load-dependent on GitHub-hosted ubuntu-latest runners under concurrent test scheduling; local 5× runs on macOS pass against both the broken and fixed states. The structural reasoning is the bisect proof — HMR client = cross-tab reload signal = listener destruction; suppressed client = no signal = no destruction. CI is the only place that exercises the failure mode.

**General rule**: only suppress HMR when the spec opens multiple tabs against the same Vite dev server AND relies on long-lived per-page listeners (storage events, window globals, subscribed signals). Single-tab specs and click-driven specs don't need it.
