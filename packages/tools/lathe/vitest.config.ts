import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // BELOW the 95 floor, recorded honestly with an entry in
  // `scripts/check-coverage.ts`'s BELOW_FLOOR_EXEMPTIONS. This package arrived
  // measured at 84.46% because its PR also touched a root file, which escalated
  // the PR-time coverage step's affected set to `--filter=*` and made it SKIP —
  // so it was never measured before merge, past the mechanism whose stated job
  // is that new packages cannot slip in below 95. That hole is fixed in
  // `affected.ts` (a root file no longer escalates under `--changed-only`,
  // because coverage is a per-package property).
  //
  // Set at the measured actual, to be ratcheted UP as the emit/input gaps get
  // real tests — the same discipline as `lint-baseline.json`. It must never be
  // lowered to absorb a regression.
  coverageThresholds: { statements: 84, branches: 72, functions: 91, lines: 88 },
  coverageExclude: [
    // gen-docs data, no logic (scaffold-recipe convention).
    'src/manifest.ts',
    // The bin entry is EXERCISED by `cli-bin.test.ts`, which spawns the real
    // bin — stronger than line coverage, but it runs in a child process where
    // v8's instrumenter cannot see it.
    'src/cli/main.ts',
  ],
})
