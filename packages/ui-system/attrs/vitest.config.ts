import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  category: 'ui',
  environment: 'happy-dom',
  coverageThresholds: { statements: 99, branches: 99, functions: 99, lines: 99 },
})
