import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  coverageThresholds: { statements: 94, lines: 94 },
  excludeBrowserTests: true,
  coverageExclude: ['src/components/**'],
})
