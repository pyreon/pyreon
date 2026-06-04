import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  excludeBrowserTests: true,
  // statements + lines stay at floor (95/94). Branches override to 86 —
  // PR #1325 added the client-side island() path (lines 157-176 in island.ts +
  // ~24 client.ts hydration scheduling arms) which is browser-only and
  // covered by islands.browser.test.tsx in real Chromium. Node-process
  // coverage in vitest can't reach those paths. Brand-new test
  // island-client-render.test.tsx adds happy-dom coverage for the bare
  // island() invocation path; further lift to 90+ requires real-browser
  // mount tests, not happy-dom stubs.
  coverageThresholds: { statements: 95, lines: 94, branches: 86 },
})
