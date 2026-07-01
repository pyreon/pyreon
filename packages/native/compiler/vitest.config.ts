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
export default defineNodeConfig({
  category: 'internals',
  overrides: { test: { testTimeout: 180_000 } },
})
