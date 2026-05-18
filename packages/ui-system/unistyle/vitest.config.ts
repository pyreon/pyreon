import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    mergeConfig(
      sharedConfig,
      createVitestConfig({
        environment: 'happy-dom',
        coverageThresholds: {
          statements: 95,
          branches: 90,
          functions: 95,
        },
      }),
    ),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
