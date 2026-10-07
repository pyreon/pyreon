import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure data-structure primitive. No DOM env needed.
// All logic lives in src/index.ts — include it in coverage measurement.
export default defineNodeConfig({
  category: 'internals',
  includeIndexInCoverage: true,
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code. Its emit is verified
  // by behaviour in the @pyreon/native-compiler suite (the golden corpus plus the sized-map specs), which owns the swiftc
  // and kotlinc lanes — the same arrangement @pyreon/http and @pyreon/charts document.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
})
