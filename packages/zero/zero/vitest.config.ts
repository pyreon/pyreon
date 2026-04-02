import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['src/tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/tests/**', 'src/**/*.test.ts'],
        thresholds: {
          // Meta-framework with build-time/server code — hard to unit test
          statements: 60,
          branches: 50,
          functions: 55,
        },
      },
    },
    resolve: {
      conditions: ['bun'],
    },
  }),
)
