import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageThresholds: {
      statements: 82,
      branches: 75,
      functions: 80,
    },
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
