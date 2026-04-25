import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

// All the plugin's logic lives in src/index.ts (828 lines). The
// shared `createVitestConfig` excludes `src/**/index.ts` from
// coverage by default (convention for packages that put only
// re-exports in index), but vite-plugin doesn't follow that
// convention. We define the coverage config explicitly here
// rather than via createVitestConfig so we can drop that exclude.
// PR #323 finding.
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json'],
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.test.tsx',
          // hmr-runtime.ts is a virtual-module body that runs in
          // the user's browser, not in Node. Excluded as
          // integration-tier (real Vite + browser session).
          'src/hmr-runtime.ts',
        ],
        thresholds: {
          statements: 85,
          branches: 80,
          functions: 90,
        },
      },
    },
  }),
)
