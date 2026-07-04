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
