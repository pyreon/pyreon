import { defineConfig, mergeConfig } from 'vitest/config'
import { nodeExcludeBrowserTests, sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  mergeConfig(sharedConfig, nodeExcludeBrowserTests),
  defineConfig({
    test: {
      globals: true,
      include: ['**/*.test.ts'],
    },
  }),
)
