import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vite'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      // Branch threshold at 88% due to structurally uncoverable branches:
      // - transition.ts: 6 `if (safetyTimer !== null)` false branches — the
      //   false side only fires when done() is called AFTER the timer was
      //   already cleared, which requires { once: true } listener removal +
      //   timer expiry sequencing not achievable in happy-dom
      // - hydrate.ts: NativeItem path (lines 228-240) requires compiler-emitted
      //   _tpl() templates at hydration time
      // - nodes.ts: keyed diff !entry path (735-736) requires a specific
      //   interleaved reorder + insertion pattern in the LIS algorithm
      // All are covered by the real-browser Playwright smoke tests.
      coverageThresholds: { branches: 88 },
    }),
    sharedConfig,
  ),
  nodeExcludeBrowserTests,
)
