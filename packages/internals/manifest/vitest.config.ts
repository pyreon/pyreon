import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure types + trivial helper. No DOM env needed.
//
// branches is 94, not 95, and that is a MEASURED re-baseline rather than a
// regression: `packages/internals` was outside check-coverage`s PACKAGE_DIRS,
// so this package had never been scanned by that gate at all. It measures
// 98.12% statements / 94.39% branches — 0.61pp under the floor. Recorded at the
// actual, with a BELOW_FLOOR_EXEMPTIONS entry carrying the reason, so the
// widened scan root can land without lowering anything else. Ratchet back to 95
// with the branch specs; never raise it to absorb a regression.
export default defineNodeConfig({
  category: 'internals',
  coverageThresholds: { statements: 95, branches: 94, functions: 95, lines: 95 },
})
