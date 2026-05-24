import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'node',
    },
    resolve: {
      // Use the bun condition like the rest of the monorepo so we load the
      // workspace TypeScript sources rather than published lib/ output.
      conditions: ['bun'],
    },
  }),
)
