import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  // Node-suite coverage sits at 100% across all four metrics after the
  // coverage-gaps + prod-mode hardening; the floor is pinned at 99 (one notch
  // below to tolerate trivial future drift). Browser-only resolution/className
  // paths are proven by the *.browser.test.tsx suites (separate runner).
  coverageThresholds: { statements: 99, branches: 99, functions: 99, lines: 99 },
  excludeBrowserTests: true,
})
