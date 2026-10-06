import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code; its emit is verified by
  // behaviour in the @pyreon/native-compiler suite (the golden corpus plus the rx specs), which owns the swiftc/kotlinc lanes.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
})
