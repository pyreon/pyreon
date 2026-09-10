import { defineNodeConfig } from '@pyreon/vitest-config'

// Explicit thresholds at the MEASURED actuals, measured on the machine that
// GATES them.
//
// This package declared none, so it inherited the `internals` category
// default of 90 — which it has never met, meaning `bun run test` for it has
// been exiting 1 on main. Nothing surfaced that: `packages/native` is outside
// the coverage gate's scan roots, and the PR-time step measures only directly
// changed packages, so a rarely-touched one is measured by nothing at all.
//
// The numbers below are what it measures after the 92%+ campaign, which is
// the first time this published package has been tested above the unit level:
// `cli.ts` sat at 56% and `lsp.ts` at 49%, so command dispatch, the check
// reporting layer, the LSP frame parser and the iOS staging functions were
// all unexercised. Writing those tests found two real bugs — a syntax error
// passing `check` silently, and the LSP dropping any non-ASCII document —
// both fixed alongside them.
//
// These are the UBUNTU figures (89.65 / 82.60 / 94.05 / 91.77), NOT this
// Mac's (90.81 / 83.65 / 97.02 / 92.83). `check.test.ts` gates three specs on
// `isSwiftUIAvailable()`, true on macOS and false on every runner, so the two
// platforms execute different code and a Mac reads ~1pp higher on every
// metric. A floor taken from the higher-capability machine is not strict, it
// is UN-SATISFIABLE — the same commit gets a different verdict per machine,
// which is the class `check-bundle-budgets` guards with its platform delta
// one directory over. A floor must come from the LOWEST-capability
// environment that measures it.
//
// The ubuntu figures were MEASURED rather than estimated: `isSwiftUIAvailable`
// was temporarily stubbed to false and the suite re-run, which is exactly what
// a runner without the SDK executes.
//
// The residual is ~94 scattered arms across `cli.ts` and `build.ts` — error
// and edge paths, no longer one nameable block. Ratchet up; never lower.
export default defineNodeConfig({
  category: 'internals',
  coverageThresholds: { statements: 89, branches: 82, functions: 94, lines: 91 },
})
