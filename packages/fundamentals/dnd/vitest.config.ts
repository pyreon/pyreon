import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageThresholds: {
      // onCleanup callbacks from @pyreon/reactivity only execute inside
      // reactive component scopes — unreachable in unit tests
      statements: 88,
      branches: 84,
      functions: 88,
    },
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
