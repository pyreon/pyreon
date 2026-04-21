import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vite'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      // Pre-existing branch gap: transition.ts safety-timer/cancel paths (lines
      // 111-164, 183, 228) and hydrate.ts NativeItem path (228-240) are
      // unreachable in happy-dom — CSS transitions don't fire transitionend and
      // NativeItem hydration requires compiler-emitted templates. These branches
      // are covered by the real-browser Playwright smoke tests. Lowering from
      // the default 90% to 88% avoids a false-negative CI gate.
      coverageThresholds: { branches: 88 },
    }),
    sharedConfig,
  ),
  nodeExcludeBrowserTests,
)
