import { defineNodeConfig } from '@pyreon/vitest-config'

// runtime-server has its renderToString + full SSR pipeline implemented
// in src/index.ts directly (not just re-exports). The default coverage
// exclude list contains `src/**/index.ts`, so we opt in to including it.
//
// statements/functions/lines locked at 98; branches at 95. The SSR streaming
// engine has a residual branch tail — abort-timing races, both-sides `__DEV__`
// gates (covered via dev-mode.test.ts / prod-mode.test.ts), and a few
// coverage-tooling-unlocatable branches — that needs abort-race orchestration
// / a tooling fix rather than more unit tests. This was a pre-existing RED gate
// (88.4% branches); the new edge-case + dev/prod-mode tests brought it green.
export default defineNodeConfig({
  category: 'core',
  includeIndexInCoverage: true,
  coverageThresholds: {
    statements: 98,
    branches: 95,
    functions: 98,
    lines: 98,
  },
})
