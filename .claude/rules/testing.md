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

## Cross-tab Playwright specs — kill Vite HMR per-context

When a Playwright spec opens a second tab via `context.newPage()` against a Vite dev server, the second tab's `page2.goto('/')` is seen by Vite as a new client connecting. Vite's pre-bundle / module-graph traversal sends an HMR update to **all** connected clients (including tab 1) over the `@vite/client` WebSocket. Tab 1 then reloads — destroying any `addEventListener('storage', …)` / `window.<global>` / signal subscriptions the test body just registered. The spec then times out at the assertion that depended on the destroyed listener.

This isn't theoretical: `e2e/fundamentals/storage.spec.ts:cross-tab localStorage sync` flaked four consecutive main-branch CI runs (25745360432 / 25728248892 / 25725838841 / 25723298232) with `TimeoutError: page.waitForFunction: Timeout 5000ms exceeded` (later variant) or `Error: page.evaluate: Execution context was destroyed, most likely because of a navigation` (earlier variant). PR #535 added `waitForLoadState('networkidle')` + a `window.__storageSync` poll as defenses; the underlying race still fired. PR #544 fixed it by killing the HMR client outright.

**Recipe** for cross-tab specs against Vite dev:

```ts
test.beforeEach(async ({ page, context }) => {
  // Kill Vite's HMR client for every page in this context. `context.route`
  // propagates to every new page (including tabs opened mid-test), so the
  // suppression covers `page2 = await context.newPage()` too — per-page
  // routes registered on `page` alone would miss tab 2.
  await context.route('**/@vite/client*', (route) => route.fulfill({ status: 204, body: '' }))
  // ... rest of setup
})
```

Without `@vite/client`, neither tab opens the HMR websocket — no HMR updates, no reloads, no listener destruction. The dev server still serves the rest of the bundle normally.

**Don't apply this guard to specs that drive the page via real clicks.** Suppressing `@vite/client` ALSO breaks click-handler delegation in the fundamentals-playground dev build (initial render works but events don't fire post-mount). Specs that drive the page via Playwright's `.click()` need HMR alive. `networkidle` alone is sufficient for the same-tab read-and-update path; the cross-tab listener-destruction race only fires when a second `goto` happens. Reference: `e2e/fundamentals/storage.spec.ts:beforeEach` (HMR-suppressed, no clicks) vs `e2e/fundamentals/storage-hydration.spec.ts:beforeEach` (no suppression, clicks-driven).

**Local bisect can't reproduce the flake.** The race is load-dependent on GitHub-hosted ubuntu-latest runners under concurrent test scheduling; local 5× runs on macOS pass against both the broken and fixed states. The structural reasoning is the bisect proof — HMR client = cross-tab reload signal = listener destruction; suppressed client = no signal = no destruction. CI is the only place that exercises the failure mode.

**General rule**: only suppress HMR when the spec opens multiple tabs against the same Vite dev server AND relies on long-lived per-page listeners (storage events, window globals, subscribed signals). Single-tab specs and click-driven specs don't need it.
