import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      coverageThresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
      },
    }),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
      test: {
        coverage: {
          // Exclude `.bench.ts` from coverage — benchmarks run under
          // `vitest bench`, not `vitest run`, so their source code
          // ends up in the denominator at 0% coverage and skews the
          // package's overall numbers (PR #323 finding).
          exclude: ['**/*.bench.ts', '**/__tests__/index.ts', '**/node_modules/**', '**/lib/**'],
        },
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
