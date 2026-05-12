# Testing Rules

## Test Runner

- Use `bun run test` to run all package tests (runs `bun run --filter='./packages/*' test`)
- Each package has its own `vitest.config.ts` extending root `vitest.shared.ts`
- Vitest globals enabled — no need to import `describe`, `it`, `expect`, `vi`

## DOM Testing

- Packages `runtime-dom`, `router`, `head`, `react-compat`, `preact-compat`, `vue-compat`, `solid-compat` use `environment: "happy-dom"`
- happy-dom means `typeof window !== "undefined"` is always true — SSR-only branches are unreachable in tests
- Use `document.createElement`, `container.innerHTML`, etc. directly in tests

## Coverage

- All packages maintain >95% on all 4 metrics (statements, branches, functions, lines)
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
