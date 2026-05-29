import { defineNodeConfig } from '@pyreon/vitest-config'

// The pure generator (`scaffold.ts`) is the measured surface and is tested
// exhaustively (file tree + name parameterization + the generated App.tsx
// PMTC-compiling to both targets). The CLI I/O entry (`index.ts`) is
// coverage-excluded — same convention as `@pyreon/create-zero` (its
// `main()` bin glue runs against a real process; `parseArgs` / `writeScaffold`
// are still asserted in tests for correctness, just not counted).
export default defineNodeConfig({
  category: 'zero',
  coverageExclude: ['src/index.ts'],
  overrides: {
    test: {
      include: ['src/tests/**/*.test.ts'],
    },
  },
})
