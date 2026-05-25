import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ['src/tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        // Coverage is informational here — `create-zero` is a CLI that
        // shells out to file-system operations and produces a directory
        // tree; the snapshot tests cover the scaffolder pipeline
        // end-to-end. Bin / args / prompt interaction is mainly tested
        // by manually running the binary.
        include: ['src/**/*.ts'],
        exclude: [
          'src/tests/**',
          'src/index.ts', // bin entry — runs the wizard interactively
          'src/args.ts',
          'src/prompts.ts',
        ],
        thresholds: {
          statements: 50,
          branches: 50,
          functions: 50,
        },
      },
    },
    resolve: {
      conditions: ['bun'],
    },
  }),
)
