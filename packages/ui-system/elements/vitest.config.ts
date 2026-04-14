import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

// Thresholds sit a couple points below the latest measured values so a
// small coverage drift doesn't fail CI unnecessarily. Overlay's
// SSR-fallback branches are tested directly against `positioning.ts` with
// `globalThis.window` stubbed — only the branches inside the React-like
// component boundary (happy-dom-only DOM events) remain legitimately
// harder to cover.
export default mergeConfig(
  createVitestConfig({
    environment: 'happy-dom',
    coverageThresholds: {
      statements: 88,
      branches: 76,
      functions: 84,
      lines: 89,
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
