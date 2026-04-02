import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageThresholds: {
      // Storybook renderer — requires Storybook runtime for full coverage
      statements: 75,
      branches: 65,
      functions: 70,
    },
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
