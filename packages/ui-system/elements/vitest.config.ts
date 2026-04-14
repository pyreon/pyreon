import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

// Thresholds reflect happy-dom-achievable coverage. Overlay's SSR-fallback
// early-returns (`if (typeof window === 'undefined') return …`) are
// unreachable when `window` is always defined in happy-dom — the
// `no-window-in-ssr` lint rule statically enforces their correctness
// instead, so we don't require runtime coverage of those branches.
export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageThresholds: {
      statements: 89,
      branches: 79,
      functions: 86,
      lines: 91,
    },
  }),
  mergeConfig(
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
    }),
    nodeExcludeBrowserTests,
  ),
)
