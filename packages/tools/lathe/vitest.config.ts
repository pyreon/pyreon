import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // Coverage floor for `@pyreon/lathe`, declared EXPLICITLY rather than left to
  // the `tools` category default — `check-coverage.ts` cannot see a category
  // default and assumes 95, which is how `@pyreon/testing` failed that gate
  // silently while its own vitest run passed. Stating them keeps the two halves
  // in agreement.
  //
  // Until recently this package had never been measured at all: the PR that
  // introduced it changed a set large enough to trip the PR-time coverage
  // step's >15-package cap, so the step SKIPPED and the 95 was never once
  // enforced. (A ROOT file in the diff produces the same outcome by a different
  // branch — `--filter=*`, which that step treats as "blast radius unknowable"
  // and exits on. That second hole is fixed in `affected.ts`; it was not this
  // package's.)
  //
  // A RATCHET, like `@pyreon/atlas`' — raise in lockstep as tests land, never
  // lower. Moved five times already: `cli/report.ts` 40 -> 98, `emit/mock.ts`
  // 77 -> 98, `emit/schema.ts` 71 -> 87, `core/naming.ts` 79 -> 97 and
  // `input/openapi.ts` 79 -> 87, taking the package 84.46 -> 90.69. What
  // remains is concentrated and known: `vite/plugin.ts` (boots a Vite pass;
  // proven by `e2e/lathe-bookshelf.spec.ts`), `verify/lower.ts` (shells out to
  // the real @pyreon/native-compiler) and `cli/run.ts` (multi-project + --json
  // orchestration).
  coverageThresholds: { statements: 90, branches: 80, functions: 95, lines: 94 },
  coverageExclude: [
    // gen-docs data, no logic (scaffold-recipe convention).
    'src/manifest.ts',
    // The bin entry is EXERCISED by `cli-bin.test.ts`, which spawns the real
    // bin — stronger than line coverage, but it runs in a child process where
    // v8's instrumenter cannot see it.
    'src/cli/main.ts',
  ],
})
