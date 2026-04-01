import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    // Branch threshold lowered: typeof window/navigator checks always
    // evaluate to true in happy-dom, making SSR branches uncoverable.
    coverageThresholds: { branches: 75 },
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
