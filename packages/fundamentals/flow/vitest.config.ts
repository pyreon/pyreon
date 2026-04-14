import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      coverageExclude: ['src/components/**'],
    }),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
