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
  coverageThresholds: { statements: 96, branches: 94, functions: 95, lines: 97 },
  // The warm-compiler process manager: its happy path is driven by every
  // kotlinc-validating spec and its parity locked by kotlin-daemon.test.ts,
  // but most of its branches are ENVIRONMENT outcomes — no java, no
  // compiler jar beside kotlinc, a JVM that never reports ready, a daemon
  // that dies mid-request — reachable only by breaking the toolchain, and
  // never on the runner that gates this. Same class as the browser-only
  // exclusions elsewhere: covered where it can be, not faked where it cannot.
  coverageExclude: ['src/kotlin-daemon.ts'],
  overrides: {
    test: {
      // One warm Kotlin compiler JVM for the whole run (see
      // src/kotlin-daemon.ts): the forks pool starts a process per test
      // file, so without this every file would pay its own JVM start and
      // cold first compile. Workers attach through the env var it publishes.
      globalSetup: ['./src/tests/global-setup-kotlin-daemon.ts'],
      testTimeout: 180_000,
      // Every worker shares one Kotlin compiler JVM. Parallel files enqueue
      // compiles behind one another, so a cold request spends its timeout
      // waiting for other tests and may start a fallback JVM while the shared
      // compiler is still busy. Library relocations change the stubs and
      // legitimately invalidate the verdict cache: cold runs must work too.
      // Serialize files in every lane; keep all real compiles and deadlines.
      fileParallelism: false,
    },
  },
})
