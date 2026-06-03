import { resolve } from 'node:path'
import type { ViteUserConfig as VitestUserConfig } from 'vitest/config'
import { buildAliases } from './aliases.ts'

/**
 * The monorepo root, resolved relative to THIS file's location.
 *
 * This file lives at `packages/internals/vitest-config/src/internals.ts`,
 * so 4 directories up is the repo root. Computed once at module load.
 */
export const REPO_ROOT = resolve(import.meta.dirname, '../../../..')

/**
 * Shared vitest base — aliases + timeout + CI retry + bun condition.
 * Consumed by `defineNodeConfig` / `defineBrowserConfig` as the outer
 * merge layer.
 *
 * Exported for back-compat: the legacy root `vitest.shared.ts` was named
 * `sharedConfig`, and during the migration the root file re-exports this
 * symbol so the 62 existing `import { sharedConfig } from '../../../vitest.shared'`
 * call sites keep working until they migrate to `defineNodeConfig`.
 */
export const sharedConfig: VitestUserConfig = {
  resolve: { alias: buildAliases(REPO_ROOT), conditions: ['bun'] },
  test: {
    // Re-install `localStorage` on globalThis when happy-dom is active.
    // Vitest's adapter excludes it because Node 22+ defines an
    // experimental getter; see vitest.setup.ts for the full story.
    // Absolute path — the setup file must resolve from any package's
    // vitest run, not just the workspace root.
    setupFiles: [resolve(REPO_ROOT, 'vitest.setup.ts')],
    // Vitest's default 5000ms is too tight for tests that do
    // `await import(...)` on Pyreon's transitively-deep module graphs
    // (rocketstyle + attrs + styler + unistyle chain, ECharts dynamic
    // chunks, document/PDF renderers, etc.). Cold first-load on shared
    // CI runners regularly hits 5-15s. Bump default to 20s — accommodates
    // typical CI variance while still surfacing real perf regressions
    // (a true regression would be 30s+).
    //
    // Tests that legitimately need more (PDF renderer, ECharts) keep
    // their per-test `{ timeout: 30_000 }` / `{ timeout: 60_000 }`
    // overrides — those overrides win against this default.
    testTimeout: 20_000,
    // CI-only retry — the unit-test parity of the e2e configs'
    // `retries: process.env.CI ? 2 : 0`. The `Test` job runs
    // `bun run --filter='*' test` across 60+ packages concurrently;
    // under that contention, timing-sensitive specs flake non-
    // deterministically (heavy cold `await import()` exceeding the
    // timeout, async-fetch-race ordering, etc.) — a *different* spec
    // each run, none reproducible in isolation. A genuine bug still
    // fails all 3 attempts; a load flake self-heals. Local stays 0 for
    // honest, fast feedback. This was the root cause of `Test` going
    // red on unrelated PRs (e5-actor-model race, dnd cold-import
    // timeout) — flakes that pass deterministically when run alone.
    /* v8 ignore next — CI/local retry split; tests run in local-or-CI but never both in one run */
    retry: process.env.CI ? 2 : 0,
  },
}

/**
 * Packages that ALSO run browser tests via `vitest.browser.config.ts`
 * extend their regular vitest config with this to exclude
 * `.browser.test.*` files from the default Node/happy-dom runner.
 *
 * Kept separate from `sharedConfig` because `mergeConfig` appends
 * array fields — a shared exclude would leak into the browser config
 * and re-exclude the browser tests we want to RUN there.
 */
export const nodeExcludeBrowserTests = {
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/lib/**',
      '**/*.browser.test.{ts,tsx}',
    ],
  },
} satisfies VitestUserConfig
