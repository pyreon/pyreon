import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageExclude: ['src/components/**', 'src/minimap.ts', 'src/editor.ts'],
    coverageThresholds: {
      branches: 70,
    },
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
