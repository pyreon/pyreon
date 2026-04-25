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
      // Bumped statements 88 → 90 in PR #324 to match the new floor
      // (actual 90.24%). Branches stays at 76 (actual 79.83%) and
      // functions at 84 (actual 86.02%) — Overlay's SSR /
      // happy-dom-only DOM event branches and ref-callback paths are
      // legitimately harder to cover; tracked via
      // BELOW_FLOOR_EXEMPTIONS for branches < 80.
      statements: 90,
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
