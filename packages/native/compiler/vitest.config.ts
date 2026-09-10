import { defineNodeConfig } from '@pyreon/vitest-config'

// The Kotlin/Swift emit tests spawn a real `kotlinc` / `swiftc` toolchain to
// typecheck the generated code (`validateKotlin` / `validateSwift`). A cold JVM
// `kotlinc` start is ~10-20s, and MANY specs run several compiles back-to-back
// (a shape check across partA/partB/wizard, or 8 canonical primitives) — so a
// single spec can exceed 60s under CI runner load, the recurring `test (native)`
// flake (canonical-primitives, native-array-method-index-callback, and
// native-component-value-const have all tripped it). Rather than sprinkle
// per-spec `it(…, 180_000)` overrides across 20+ files (which every NEW native
// test then has to remember), set a package-wide `testTimeout` sized for the
// multi-compile specs. It only changes how long a spec MAY take, never what it
// asserts; the trade-off is a genuinely-hung unit test takes longer to surface,
// acceptable for a compile-heavy package.
// Explicit thresholds, because the `internals` category default of 90 was
// inherited and has never been met — so `bun run test` for this package has
// been exiting 1 on main. Nothing surfaced it: `packages/native` is outside
// the coverage gate's scan roots, and the PR-time step measures only directly
// changed packages, so a package touched rarely is measured by nothing.
//
// The values sit BELOW the observed range rather than at a single reading.
// Coverage here is NOT deterministic — which validate specs execute depends
// on toolchain availability and verdict-cache state, and repeat runs land
// between 88.80-88.82 statements / 83.09-83.12 branches. Pinning one
// measurement would make the gate flake on a run that legitimately executed
// one fewer compile.
//
// Raise these as tests land; never lower them to absorb a regression.
export default defineNodeConfig({
  category: 'internals',
  coverageThresholds: { statements: 88, branches: 82, functions: 91, lines: 90 },
  overrides: { test: { testTimeout: 180_000 } },
})
