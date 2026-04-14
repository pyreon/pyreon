import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageThresholds: {
      statements: 88,
      branches: 80,
      functions: 85,
    },
  }),
  mergeConfig(
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
    nodeExcludeBrowserTests,
  ),
)
