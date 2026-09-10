import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Branch threshold at 86% (post real-test coverage hardening). Lowered
  // from 88 to honest measurement (currently 86.43%). Coverage drifted as
  // template.ts (29 uncov), nodes.ts (27 uncov), hydrate.ts (25 uncov), and
  // mount.ts (22 uncov) gained branches from new features without matching
  // test additions. Structurally uncoverable arms include:
  // - transition.ts: 6 `if (safetyTimer !== null)` false branches (timing
  //   sequence not achievable in happy-dom)
  // - hydrate.ts: NativeItem path requires compiler-emitted _tpl() templates
  // - nodes.ts: keyed diff !entry path requires specific LIS reorder pattern
  // - template.ts: many compiler-emitted fast paths only reachable via
  //   real compiled JSX, exercised by real-Chromium e2e
  // Real-test coverage for props.ts (29 tests in branch-coverage-real.test.ts
  // covering event handler edge cases, innerHTML/dangerouslySetInnerHTML,
  // class/style normalization, URL-safety guards, boolean/null/custom-element
  // dispatch) lifted from 86.03% → 86.43%. Then branch-coverage-real-2.test.ts
  // (16 Transition/TransitionGroup/KeepAlive component tests) +
  // branch-coverage-prod-mode.test.ts (12 NODE_ENV='production' tests for
  // runtime/props dev-gates) lifted further to 86.88%.
  // The remaining uncov in template/nodes/hydrate/mount is covered by
  // Playwright in real Chromium.
  // Statements re-baselined 95 → 93 (measured 93.98 at the 2026-07
  // coverage-gate restoration; the Coverage (Full) gate had been red on every
  // main run — a red-on-arrival threshold detects nothing). The statement
  // drift came from dev-only/browser-only feature waves: devtools.ts
  // reactive-overlay + DOM→signal picker machinery (covered by
  // e2e/reactive-overlay.spec.ts in real Chromium), hydrate.ts parity-fuzz
  // recovery arms, binding-registry.ts. Aspiration stays 95 — raise back in
  // lockstep as targeted tests land (BELOW_FLOOR_EXEMPTIONS entry in
  // scripts/check-coverage.ts mirrors these numbers).
  // Ratcheted 93 → 94 stmts / 94 → 95 lines (measured 94.59 / 95.96) after the
  // props.ts reactive getter-descriptor + applySelectValueProp + applyAttrProp
  // aria-boolean paths and binding-registry.ts no-doc / stale-graph-node guards
  // gained behavioral tests. Branches stay 86 (measured 86.61 — the residual is
  // the compiler-emitted / timing arms covered only by real-Chromium e2e).
  // Ratcheted 92/94/83 -> 96/97/90 (measured 96.80 / 97.68 / 90.51) by the
  // 92%+ campaign. Branches do NOT yet clear 92, and that is stated rather
  // than smoothed over — see the BELOW_FLOOR_EXEMPTIONS entry for what
  // remains and why.
  //
  // The lift went at the hydration machinery, which is where this package's
  // silent failures live: the row-plan bail contract on its VNODE side (a plan
  // compiled from row 0 replayed over rows whose vnodes differ), the compiled
  // template adopt verifier's marker scanning and its rows-2..N plan replay,
  // mismatch recovery, async-component hydration, and the dev overlays that
  // install global listeners on the user's own app.
  coverageThresholds: { statements: 96, lines: 97, branches: 90 },
  // --expose-gc makes `globalThis.gc` available in the fork workers so the
  // GC-observable retention regression (for-lis-scratch-release.test.tsx)
  // RUNS in CI instead of skipping. One flag, no behavioral change for the
  // rest of the suite.
  overrides: {
    test: {
      // Vitest 4: pool options are top-level (`poolOptions` was removed).
      execArgv: ['--expose-gc'],
    },
  },
})
