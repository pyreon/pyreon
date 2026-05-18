import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    mergeConfig(
      sharedConfig,
      createVitestConfig({
        environment: 'happy-dom',
        coverageExclude: ['src/components/**', 'src/minimap.ts', 'src/editor.ts'],
        coverageThresholds: {
          branches: 70,
        },
      }),
    ),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
