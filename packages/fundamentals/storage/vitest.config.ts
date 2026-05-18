import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    sharedConfig,
    createVitestConfig({
      environment: 'happy-dom',
      // Branch threshold lowered: isBrowser()/typeof indexedDB checks
      // always evaluate to true in happy-dom, making SSR branches uncoverable.
      coverageThresholds: { branches: 85 },
    }),
  ),
  defineConfig({
    resolve: {
      conditions: ['bun'],
    },
  }),
)
