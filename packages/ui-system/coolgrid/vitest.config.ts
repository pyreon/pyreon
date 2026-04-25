import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      coverageThresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
      },
    }),
    defineConfig({
      resolve: {
        conditions: ['bun'],
      },
      test: {
        testTimeout: 15000,
        coverage: {
          // Excluded from Node-side coverage — these files are CSS-in-JS
          // styled-component templates whose inner `styles` callback only
          // runs when the styler resolver mounts a component via the real
          // styler runtime. Exercised end-to-end by
          // `coolgrid.browser.test.tsx` (Playwright Chromium). PR #323
          // finding.
          exclude: [
            'src/Col/styled.ts',
            'src/Row/styled.ts',
            'src/Container/styled.ts',
          ],
        },
      },
    }),
  ),
  nodeExcludeBrowserTests,
)
