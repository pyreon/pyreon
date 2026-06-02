import { defineNodeConfig } from '@pyreon/vitest-config'

// All the plugin's logic lives in src/index.ts (828 lines). The default
// coverage-exclude list contains `src/**/index.ts`, so we opt in to
// keep it measured.
export default defineNodeConfig({
  category: 'tools',
  includeIndexInCoverage: true,
  coverageExclude: [
    // hmr-runtime.ts is a virtual-module body that runs in the user's
    // browser, not in Node. Excluded as integration-tier (real Vite +
    // browser session).
    'src/hmr-runtime.ts',
  ],
  coverageThresholds: {
    statements: 95,
    branches: 88,
    functions: 94,
    lines: 94,
  },
})
