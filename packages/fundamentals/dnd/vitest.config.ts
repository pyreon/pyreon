import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      coverageThresholds: {
        // onCleanup callbacks from @pyreon/reactivity only execute inside
        // reactive component scopes — unreachable in unit tests
        statements: 90,
        branches: 85,
        functions: 89,
      },
    }),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
