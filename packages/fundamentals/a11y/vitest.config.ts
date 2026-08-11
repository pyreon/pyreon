import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // happy-dom spec-parity: suppress the non-spec deferred `hashchange` events
  // happy-dom queues for history.pushState/replaceState — router.test.tsx
  // drives a real (hash-mode) router, so without this the echo from one
  // spec's `router.push` lands in the next spec under CI load and the route
  // announcer fires for a traversal the test never made (see
  // src/tests/setup.ts + @pyreon/test-utils happy-dom-hashchange-guard.ts).
  setupFiles: ['./src/tests/setup.ts'],
  coverageThresholds: { statements: 99, branches: 98, functions: 99, lines: 99 },
  // visually-hidden.tsx is the render layer — exercised by the real-Chromium
  // `a11y.browser.test.tsx` (run via `bun run test:browser`), not the
  // node/happy-dom suite. Browser coverage isn't aggregated into the node
  // threshold, so excluding it keeps the node gate honest.
  // skip-link.tsx is the same shape: exercised only by the real-Chromium
  // `skip-link.browser.test.tsx` (getComputedStyle clip/reveal + real
  // keyboard-focus moves need a real browser), so it's excluded from the
  // node threshold for the same reason.
  coverageExclude: ['src/visually-hidden.tsx', 'src/skip-link.tsx'],
})
