import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code. Its emit is verified
  // by behaviour in the @pyreon/native-compiler suite (the golden corpus plus the machine specs), which owns the swiftc and
  // kotlinc lanes — the same arrangement @pyreon/http and @pyreon/charts document.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  coverageThresholds: { statements: 98, branches: 98, functions: 98, lines: 98 },
})
