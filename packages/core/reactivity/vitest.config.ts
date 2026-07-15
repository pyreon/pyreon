import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  // `reactive-devtools.ts` + `lpih.ts` are DEV-ONLY instrumentation bridges:
  // the entire capture path tree-shakes under NODE_ENV=production (locked by
  // `reactive-devtools-treeshake.test.ts`), so NONE of it runs in a shipped
  // app. They keep dedicated suites (`reactive-devtools.test.ts`, `lpih.test.ts`
  // — ~86-91% branch) but their residual tail is cross-engine stack parsing
  // (JSC/SpiderMonkey forms V8 never emits; `Number.isFinite`-false arms behind
  // a `\d+` regex that can't produce a non-finite) + Node-absent globals
  // (`process.pid` / `performance` undefined). Those are un-exercisable under
  // V8/Node without mocking the runtime (which tests the mock). They're
  // excluded from the PRODUCTION coverage gate — same precedent as the
  // devtools panel — so the gate measures the code that actually ships.
  coverageExclude: ['src/reactive-devtools.ts', 'src/lpih.ts'],
  // branches: honest re-baseline 98 → 96 (2026-07). Measured node-suite
  // reality on main was 96.02% — the configured 98 made the LOCAL
  // `bun run test -- --coverage` exit non-zero on a clean tree while the CI
  // coverage gate stayed green (scripts/check-coverage.ts gates on the
  // STATEMENTS metric only), violating the "thresholds sit at/below measured
  // reality" invariant (see ci.yml `coverage-full`). The residual branch tail
  // is defensive/cross-engine arms in coverage.ts + reactive-describe.ts +
  // createSelector.ts — ratchet back up as tests land, per the lint-baseline
  // pattern. 96 stays above the repo-wide 95-branch floor.
  coverageThresholds: { statements: 98, lines: 99, branches: 96 },
  overrides: {
    test: {
      // --stack-size=4000 (KB, ~4 MB — safely below the 8 MB default OS stack
      // of the vitest fork-pool child process, so a genuine overflow stays a
      // CATCHABLE RangeError, never a segfault). The deep-chain regression
      // (`batch-glitch-freedom.test.ts`) drives a depth-10,000 lazy-computed
      // chain, whose lazy PULL-READ is inherently recursive (evaluating a deep
      // dirty chain recurses through each computed's user closure — the same
      // shape in 0.45.0, where the deep-chain WAS "correct at 10,000"). The
      // default V8 JS-stack (~984 KB) overflows that read at ~2,700, which is
      // BELOW the depth where the pre-fix RECURSIVE write-time dirty cascade
      // overflowed — masking the very bug the test locks. This bump restores
      // the standalone-Bun headroom the "correct at 10,000" bar assumes: the
      // read survives past 20,000 while the (reverted) recursive cascade still
      // overflows well under 10,000. One flag, additive headroom only — no
      // behavioral change for the other suites.
      execArgv: ['--stack-size=4000'],
    },
  },
})
