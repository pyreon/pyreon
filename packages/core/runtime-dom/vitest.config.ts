import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Branch threshold at 88% due to structurally uncoverable branches:
  // - transition.ts: 6 `if (safetyTimer !== null)` false branches — the
  //   false side only fires when done() is called AFTER the timer was
  //   already cleared, which requires { once: true } listener removal +
  //   timer expiry sequencing not achievable in happy-dom
  // - hydrate.ts: NativeItem path (lines 228-240) requires compiler-emitted
  //   _tpl() templates at hydration time
  // - nodes.ts: keyed diff !entry path (735-736) requires a specific
  //   interleaved reorder + insertion pattern in the LIS algorithm
  // All are covered by the real-browser Playwright smoke tests.
  coverageThresholds: { statements: 94, lines: 94, branches: 88 },
})
