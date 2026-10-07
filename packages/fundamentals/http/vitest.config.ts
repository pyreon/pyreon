import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // The real-Chromium suite runs under `test:browser`, not here.
  excludeBrowserTests: true,
  // Explicit, and above the 95 floor `scripts/check-coverage.ts` enforces.
  // The `fundamentals` category default is 85/80 — BELOW that floor, so
  // inheriting it would need a visible-debt exemption entry instead.
  // Ratchet these UP as coverage improves; never down to absorb a drop.
  // The native-compiler plugin (`src/native-plugin/`) is tooling that runs in Node, not library code. It has no
  // unit tests in this package on purpose: its emit is verified by behaviour in the @pyreon/native-compiler suite
  // (the golden corpus plus the native-http / native-usequery / native-use-stream specs), which owns the swiftc
  // and kotlinc lanes — the same arrangement @pyreon/charts documents.
  coverageExclude: ['src/native-plugin.ts', 'src/native-plugin/**'],
  coverageThresholds: { statements: 98, branches: 95, functions: 98, lines: 98 },
})
