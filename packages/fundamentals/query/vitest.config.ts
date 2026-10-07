import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code. It has no
  // unit tests in this package on purpose: its emit is verified by behaviour in the @pyreon/native-compiler suite
  // (the golden corpus plus the native-http / native-usequery / native-use-stream specs), which owns the swiftc
  // and kotlinc lanes — the same arrangement @pyreon/charts documents.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  coverageThresholds: { statements: 98, branches: 98, functions: 99, lines: 98 },
})
