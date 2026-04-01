import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    // Branch threshold lowered: V8 counts both sides of ?? and ||
    // operators, plus typeof checks are always true in happy-dom.
    // PDF/DOCX renderers have many format-specific branches.
    coverageThresholds: { branches: 75 },
  }),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
