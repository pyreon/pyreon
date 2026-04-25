import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

// All logic lives in src/index.ts, so we can't use createVitestConfig()
// which excludes src/**/index.ts by default.
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'happy-dom',
      mockReset: true,
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/tests/**'],
        thresholds: {
          statements: 85,
          branches: 80,
          functions: 90,
          lines: 85,
        },
      },
    },
  }),
)
