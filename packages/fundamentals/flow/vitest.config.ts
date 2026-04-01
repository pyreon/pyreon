import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageExclude: ['src/components/**'],
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
