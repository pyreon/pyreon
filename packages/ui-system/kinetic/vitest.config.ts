import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Node-suite coverage is 100% on all four metrics after the coverage-gaps
  // sweep. The animation-lifecycle arms the prior baseline left uncovered were
  // closed HONESTLY:
  //   - The leave-path style/class guards, the appear-proxy null/second-set
  //     arms, the GroupRenderer/TransitionGroup accessor + leaving-diff +
  //     onAfterLeave→forceUpdate paths, the wrapper-cleared-mid-onEnd guards,
  //     and the `kinetic(tag).group()` factory branch are now driven by real
  //     tests (fake-rAF harness + reactive-accessor invocation).
  //   - The shouldRender accessor + render-time style ternaries are covered via
  //     real renderToString (SSR) of Collapse.
  //   - The onEnd `else if (stage()==='leaving')` and show-watch
  //     `else if (!showVal && …)` arms were REMOVED (converted to plain `else`):
  //     they were provably-unreachable false arms given the active-gate /
  //     show-change invariants — see the per-site comments. No behaviour change
  //     (all 259 tests pass); the dead branch simply no longer exists.
  //   - Two genuinely-unreachable defensive arms keep a precise single-line
  //     `/* v8 ignore next */` (useAnimationEnd's double-done re-entrancy guard;
  //     the CollapseRenderer height-ternary's transient `: {}` tail, which only
  //     renders mid-animation in a real browser — kinetic.browser.test.tsx).
  // Floor held at 98 (2pp headroom) to absorb minor future drift.
  coverageThresholds: {
    statements: 98,
    branches: 98,
    functions: 98,
    lines: 98,
  },
})
