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
  // Ratcheted 62/75/37/61 -> 98/94/97/98 by the 92%+ campaign (measured
  // 98.86 / 94.39 / 97.99 / 98.80) — both metrics now clear the repo-wide
  // bar, from a package that was the furthest below it.
  //
  // The lift is almost entirely one test: `every-component-mounts`. A
  // component library's long tail is the part nobody tests — components
  // declared, exported and documented, rendered by no spec at all — and a
  // rocketstyle chain with a bad `.theme()` key or a missing base throws on
  // FIRST MOUNT, so the first person to find it is a consumer at runtime.
  // The list is derived from the barrel rather than hand-written, so a new
  // export is covered the day it lands.
  //
  // That it moves the number so far is the point, not a side effect: these
  // files sat at 25-60% statements with 100% branches, i.e. definition
  // chains that had evaluated but never RUN.
  coverageThresholds: { statements: 98, branches: 94, functions: 97, lines: 98 },
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
