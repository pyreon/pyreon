import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      coverageThresholds: {
        statements: 68,
        branches: 55,
        functions: 65,
      },
    }),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
      test: {
        testTimeout: 15000,
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
