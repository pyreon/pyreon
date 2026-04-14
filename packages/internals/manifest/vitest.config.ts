import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      // Universal package — pure types + one trivial helper. No DOM env needed.
      environment: 'node',
    },
  }),
)
