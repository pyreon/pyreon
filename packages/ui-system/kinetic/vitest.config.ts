import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    sharedConfig,
    createVitestConfig({
      environment: 'happy-dom',
      coverageThresholds: {
        statements: 88,
        branches: 80,
        functions: 85,
      },
    }),
  ),
  mergeConfig(
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
    nodeExcludeBrowserTests,
  ),
)
