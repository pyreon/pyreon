import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(sharedConfig, nodeExcludeBrowserTests),
  defineConfig({
    test: {
      globals: true,
      // happy-dom required by mountReactive / mountAndExpectOnce tests.
      // Existing non-DOM tests run fine in this environment too.
      environment: 'happy-dom',
    },
  }),
)
