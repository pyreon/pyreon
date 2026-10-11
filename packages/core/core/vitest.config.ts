import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // Tooling emit is verified in the native compiler's real-toolchain suite.
  coverageExclude: ['src/native-plugin.ts'],
  coverageThresholds: { statements: 98, branches: 98, functions: 98, lines: 98 },
})
