import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig(),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
