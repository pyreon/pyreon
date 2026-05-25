import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  // Chrome-extension surfaces — exercised only by the panel UI in a
  // real Chrome devtools instance, not by Node-side vitest.
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
})
