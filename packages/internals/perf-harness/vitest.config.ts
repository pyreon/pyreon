import { defineNodeConfig } from '@pyreon/vitest-config'

// overlay.ts is a DOM-heavy draggable floating panel with shadow DOM
// + pointer drag events — needs real browser. Exercised by Chromium
// e2e via examples/perf-dashboard.
export default defineNodeConfig({
  category: 'internals',
  coverageExclude: ['src/overlay.ts'],
  coverageThresholds: { statements: 95, branches: 80, functions: 95, lines: 95 },
})
