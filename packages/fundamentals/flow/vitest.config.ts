import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  coverageThresholds: { statements: 99, branches: 99, functions: 99, lines: 99 },
  excludeBrowserTests: true,
  // edge-geometry.ts moved out of src/components/ (verbatim) so the instance
  // can memoize it per edge — same coverage story as components/**: its full
  // branch surface (measured handles, floating endpoints, waypoints) is only
  // driven by the real-Chromium suites (edge-render/handle-anchor browser
  // tests + the app-showcase flow e2e); happy-dom has no layout.
  coverageExclude: ['src/components/**', 'src/edge-geometry.ts'],
})
