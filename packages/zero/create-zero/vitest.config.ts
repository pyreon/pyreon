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
        // `create-zero` is a CLI scaffolder. PR2 added test coverage for
        // `parseArgs` + `resolveFeatures`; PR1 covers the scaffolder
        // pipeline end-to-end via real-disk snapshot tests. The surfaces
        // NOT covered are the entry-point's interactive wizard (clack
        // prompts against a real TTY) and the args.ts help text / error
        // branches — both reachable only via the bin entry, would need
        // a TTY mock to test meaningfully.
        include: ['src/**/*.ts'],
        exclude: [
          'src/tests/**',
          'src/index.ts', // bin entry — runs the wizard interactively
          'src/args.ts', // CLI arg parser — parseArgs + resolveFeatures tested via features.test.ts; help text + error branches reachable only via bin
          'src/prompts.ts', // interactive prompt machinery (resolveFeatures itself is tested via features.test.ts)
        ],
        thresholds: {
          statements: 85,
          branches: 80,
          functions: 70,
        },
      },
    },
    resolve: {
      conditions: ['bun'],
    },
  }),
)
