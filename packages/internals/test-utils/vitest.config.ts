import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      // happy-dom required by mountReactive / mountAndExpectOnce tests.
      // Existing non-DOM tests run fine in this environment too.
      environment: 'happy-dom',
    },
  }),
)
