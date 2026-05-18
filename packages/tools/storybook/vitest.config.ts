import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    sharedConfig,
    createVitestConfig({
      environment: 'happy-dom',
      coverageThresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
      },
    }),
  ),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
