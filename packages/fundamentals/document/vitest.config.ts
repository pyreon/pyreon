import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    sharedConfig,
    createVitestConfig({
      environment: 'happy-dom',
      // Branch threshold lowered: V8 counts both sides of ?? and ||
      // operators, plus typeof checks are always true in happy-dom.
      // PDF/DOCX renderers have many format-specific branches.
      // Floor-bumped 75 → 80 in PR #324 (actual 80.67%).
      coverageThresholds: { branches: 80 },
    }),
  ),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
