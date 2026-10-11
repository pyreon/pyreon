import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // Tooling emit is verified in the native compiler's real-toolchain suite.
  coverageExclude: ['src/native-plugin.ts'],
  environment: 'happy-dom',
  excludeBrowserTests: true,
  coverageThresholds: { statements: 99, lines: 99, branches: 98, functions: 99 },
})
