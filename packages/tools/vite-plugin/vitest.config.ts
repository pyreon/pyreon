import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vite'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  createVitestConfig({
    coverageThresholds: {
      // Vite plugin code runs at build time — coverage requires a running Vite instance
      statements: 0,
      branches: 0,
      functions: 0,
    },
  }),
  sharedConfig,
)
