import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // FIRST honest baseline. Until now `@pyreon/lathe` had never been measured:
  // the PR that introduced it changed a set large enough to trip the coverage
  // step's >15-package cap, so the step SKIPPED and the 95 the gate assumes
  // for a package with no explicit thresholds was never once enforced.
  // Measured 87.74 / 75.21 / 93.24 / 91.72.
  //
  // Declared EXPLICITLY rather than left to the `tools` category default,
  // because `check-coverage.ts` cannot see a category default and assumes 95 —
  // which is how `@pyreon/testing` failed that gate silently while its own
  // vitest run passed. Stating them keeps the two halves in agreement.
  //
  // These are a RATCHET, like `@pyreon/atlas`' — raise them in lockstep as
  // tests land, never lower. The uncovered surface is concentrated and known:
  // `emit/schema.ts` (the type/schema renderer, exercised end-to-end by the
  // generate + real-spec suites rather than per-branch), `input/openapi.ts`
  // (malformed-document arms a real spec never produces), `vite/plugin.ts`
  // (boots a Vite pass; proven by `e2e/lathe-bookshelf.spec.ts`),
  // `verify/lower.ts` (shells out to the real @pyreon/native-compiler), and
  // `cli/run.ts` (multi-project + `--json` orchestration).
  coverageThresholds: {
    statements: 86,
    branches: 74,
    functions: 92,
    lines: 90,
  },
  coverageExclude: [
    // gen-docs data, no logic (scaffold-recipe convention).
    'src/manifest.ts',
    // The bin entry is EXERCISED by `cli-bin.test.ts`, which spawns the real
    // bin — stronger than line coverage, but it runs in a child process where
    // v8's instrumenter cannot see it.
    'src/cli/main.ts',
  ],
})
