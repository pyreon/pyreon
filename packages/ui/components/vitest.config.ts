import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  // Every one of the 67 components lives in its own `<Name>/index.ts` (the
  // index file IS the component, not a re-export barrel). Without this flag
  // the default `src/**/index.ts` coverage exclude drops the entire library
  // and the gate measures only the 4 bases — the same vacuous-threshold trap
  // @pyreon/store hit (PR #2167). Un-exclude so components are actually measured.
  includeIndexInCoverage: true,
  // Honest baseline captured when the coverage gate was first turned on for
  // packages/ui (this PR). The library is imported but almost never RENDERED
  // in tests, so definition-chain statements are covered while the
  // `.theme`/`.states`/`.sizes` callbacks (the bulk of the functions) are not.
  // Below the ui floor (80/75/80/80) → carried in check-coverage.ts
  // BELOW_FLOOR_EXEMPTIONS. This is a RATCHET: every Phase-1+ test that mounts
  // a component lifts functions/lines fast — raise these + the exemption in
  // lockstep as coverage climbs, never lower them.
  coverageThresholds: { statements: 49, branches: 72, functions: 16, lines: 50 },
  overrides: {
    // oxc transformer JSX config — these UI packages use Pyreon's JSX
    // import source rather than React's default.
    // @ts-expect-error vitest's UserConfig type doesn't know about oxc plugin opts
    oxc: {
      jsx: {
        runtime: 'automatic',
        importSource: '@pyreon/core',
      },
    },
  },
})
