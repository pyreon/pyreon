import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageThresholds: {
      statements: 95,
      branches: 95,
      functions: 95,
    },
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
