import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    mergeConfig(
      // Base: shared `testTimeout` (20s) + CI `retry`. This config did
      // NOT merge `sharedConfig` before, so it silently ran on vitest's
      // 5000ms default — and `await import('../index')` cold-loads
      // @atlaskit/pragmatic-drag-and-drop, which exceeds 5s under CI's
      // 60-process parallel contention. That was the root cause of the
      // dnd `Test` flake on unrelated PRs.
      sharedConfig,
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
    ),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
