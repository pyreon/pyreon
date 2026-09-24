import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // happy-dom spec-parity: suppress the non-spec `hashchange` events
  // happy-dom queues for history.pushState/replaceState (real browsers
  // never fire those — see src/tests/setup.ts for the full story).
  setupFiles: ['./src/tests/setup.ts'],
  // src/scroll.ts: scroll restoration needs real browser scroll mechanics
  //   (scrollY positioning + scroll-event timing) — happy-dom returns 0 for
  //   all scroll metrics. Exercised by e2e nav tests in ssr-showcase.
  // src/tests/setup.ts: test setup file, not production source.
  coverageExclude: ['src/scroll.ts', 'src/tests/**'],
  // Ratcheted 91/85 → 96/92 (measured 96.59/92.19). The 2026-07 re-baseline
  // attributed the gap to feature waves covered by e2e rather than node
  // vitest; that was true of some of it and not most. What was actually
  // missing was error-path coverage of whole features: the single-fetch
  // server-loader pipeline (both halves, including the generation guards that
  // stop a stale response clobbering a newer navigation), the pending-loader
  // timing machine, the not-found trie's tiebreakers, the `beforeunload`
  // refcount, SWR background revalidation, and every `isServer` arm — the
  // last of which needs a NODE-environment file, since happy-dom makes them
  // unreachable by construction (see router-ssr-environment.test.ts).
  //
  // The residual is genuinely two-tier: ~20 branches are env-gate arms a node
  // run cannot reach, and ~10 more are RouterLink external/target/rel logic
  // covered by routerlink-external.browser.test.tsx. Duplicating those in
  // node would move the number without reducing risk.
  //
  // Aspiration stays 95 branches — raise in lockstep as the remainder lands
  // (BELOW_FLOOR_EXEMPTIONS entry in scripts/check-coverage.ts mirrors these).
  coverageThresholds: {
    statements: 96,
    branches: 92,
    functions: 98,
    lines: 98,
  },
})
