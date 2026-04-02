import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vite'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  createVitestConfig({
    coverageThresholds: {
      // Lint rules have many branches — 56 rules × multiple code patterns
      statements: 65,
      branches: 55,
      functions: 60,
    },
  }),
  sharedConfig,
)
