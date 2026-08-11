import { defineNodeConfig } from '@pyreon/vitest-config'

// overlay.ts is a DOM-heavy draggable floating panel with shadow DOM
// + pointer drag events — needs real browser. Exercised by Chromium
// e2e via examples/perf-dashboard.
export default defineNodeConfig({
  category: 'internals',
  // happy-dom spec-parity hashchange-echo guard for the router counter tests
  // (per-file happy-dom pragma); no-ops in the node-environment files.
  // See src/tests/setup.ts.
  setupFiles: ['./src/tests/setup.ts'],
  coverageExclude: ['src/overlay.ts'],
  coverageThresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
})
