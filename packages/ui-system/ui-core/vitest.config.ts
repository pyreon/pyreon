import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  setupFiles: ['./src/tests/setup.ts'],
  coverageExclude: ['src/tests/**'],
  coverageThresholds: { statements: 99, lines: 99, branches: 99, functions: 99 },
})
