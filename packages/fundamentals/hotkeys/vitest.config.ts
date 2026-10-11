import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  // Tooling is verified in the native compiler suite with real toolchains.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  environment: 'happy-dom',
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
})
