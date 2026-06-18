import { defineNodeConfig } from '@pyreon/vitest-config'

// The Kotlin/Swift emit tests spawn a real `kotlinc` / `swiftc` toolchain to
// typecheck the generated code (`validateKotlin` / `validateSwift`). A cold JVM
// `kotlinc` start is ~10-20s, which is marginal against the shared 20s default
// `testTimeout` and intermittently TIMES OUT under CI runner load — the
// recurring `test (native)` flake (e.g. canonical-primitives P2.2 layout,
// signal-number-float "emitted Kotlin is well-formed"). Bumping the per-test
// timeout to 60s gives the compiler-spawn the headroom it needs; it does not
// change what the tests assert, only how long they may take.
export default defineNodeConfig({
  category: 'internals',
  overrides: { test: { testTimeout: 60_000 } },
})
