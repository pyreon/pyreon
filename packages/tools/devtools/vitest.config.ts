import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { defineConfig, mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(
    createVitestConfig({
      environment: 'happy-dom',
      coverageExclude: [
        'src/background.ts',
        'src/content-script.ts',
        'src/devtools.ts',
        'src/page-hook.ts',
        'src/panel.ts',
      ],
      coverageThresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    }),
    defineConfig({}),
  ),
  sharedConfig,
)
