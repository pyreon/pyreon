import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(sharedConfig, createVitestConfig({ environment: 'happy-dom' })),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
