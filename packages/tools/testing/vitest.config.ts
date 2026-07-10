import { mergeConfig } from 'vitest/config'
import { defineNodeConfig } from '@pyreon/vitest-config'

// This package's own tests are `.tsx` using raw JSX with the @pyreon/core
// runtime (they exercise render() on real components), so the node runner's
// transform must route JSX to @pyreon/core — same override the browser config
// carries. (Most framework packages test via `transformJSX` on strings and
// never hit this.)
export default mergeConfig(
  defineNodeConfig({
    category: 'tools',
    environment: 'happy-dom',
    excludeBrowserTests: true,
    // Dogfood the package's own `setupFiles` entry (`@pyreon/testing/vitest`):
    // registers afterEach(cleanup) + the jest-dom matchers for THIS suite the
    // same way consumer suites wire it — the setup module is real shipped
    // surface, so it must be exercised (it sat at 0% coverage before this).
    setupFiles: ['./src/vitest.ts'],
    // Explicit honest thresholds (2026-07 coverage-gate restoration): without
    // an explicit `statements:` entry the check-coverage gate assumed 95 while
    // the category-default vitest gate enforced 80/75 — so the package failed
    // the Coverage (Full) gate while its own runs looked healthy. Measured
    // 100/91.66/100/100 after the failure-path specs + setup dogfooding
    // landed; thresholds sit 1pp under (elements' drift-margin convention).
    // The 2 residual uncovered branches are matcher-internal defensive arms.
    coverageThresholds: { statements: 99, branches: 90, functions: 99, lines: 99 },
    // --expose-gc so `globalThis.gc` is available to the GC/leak matchers
    // (expectGarbageCollected / expectNoReactiveLeak) — same harness as
    // @pyreon/runtime-dom.
    overrides: {
      test: {
        execArgv: ['--expose-gc'],
      },
    },
  }),
  {
    oxc: {
      jsx: {
        runtime: 'automatic',
        importSource: '@pyreon/core',
      },
    },
  },
)
