import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  excludeBrowserTests: true,
  // Browser-only files excluded from the NODE suite (each exercised end-to-end
  // by elements.browser.test.tsx in Playwright Chromium + ui-showcase e2e):
  //  - Overlay/positioning.ts — viewport-fit calculations need real DOMRect /
  //    scroll metrics that happy-dom doesn't model.
  //  - Text/styled.ts, helpers/Content/styled.ts — CSS-in-JS `styles` callback
  //    bodies only run inside `makeItResponsive` when the real styler resolver
  //    mounts the component. (helpers/Wrapper/styled.ts is NOT excluded — its
  //    `styles` callback is unit-tested directly in wrapper-block-cascade.test.ts.)
  coverageExclude: [
    'src/Overlay/positioning.ts',
    'src/Text/styled.ts',
    'src/helpers/Content/styled.ts',
  ],
  // Node-suite coverage is 100% on all four metrics. The handful of genuinely
  // unreachable / SSR-only / prod-only defensive arms (Element's onMount null
  // ref guard, Wrapper's needsFix+innerHTML dead branch, Iterator's
  // empty-array guards that classifyData already filters out, useOverlay's
  // isServer guards + isContentLoaded-gated computePosition no-content arms +
  // the always-paired resolved-align ifs + the devWarn prod gate) carry
  // targeted `/* v8 ignore */` annotations with per-site rationale. The
  // reachable paths — including the equalize() ResizeObserver lifecycle, the
  // active modal Overlay render, and the SSR setupListeners short-circuit —
  // are covered by real node/happy-dom tests, not ignored.
  //
  // Thresholds sit at 99 to leave a 1pp drift margin while holding the >98 bar.
  coverageThresholds: {
    statements: 99,
    branches: 99,
    functions: 99,
    lines: 99,
  },
})
