import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vite'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      coverageThresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
      },
    }),
    defineConfig({
      test: {
        coverage: {
          // Excluded from coverage — these modules are exercised only by
          // integration tests (subprocess CLI invocations, fs.watch on a
          // real filesystem, real .gitignore parsing) which are out of
          // scope for unit-test coverage. The runner.ts smoke test
          // exercises them indirectly. PR #323 finding.
          exclude: [
            'src/cli.ts',
            'src/watcher.ts',
            'src/config/ignore.ts',
            'src/lsp.ts',
          ],
        },
      },
    }),
  ),
  sharedConfig,
)
