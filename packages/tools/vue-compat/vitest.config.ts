import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  // Threshold history (post v8-ignore campaign):
  // - Baseline: 86.47% branches
  // - PR #1302 (CLOSED): cosmetically lifted to 95.57% via v8-ignores —
  //   closed at the user's direction since gaming the gate is dishonest
  // - Current: 87% via real-test additions in branch-coverage-real.test.ts
  //   (ref / shallowRef / triggerRef / unref / toValue contracts, computed
  //   readonly throw + writable, reactive/readonly proxy traps, toRaw/toRef/
  //   toRefs, watch single/array/getter/immediate, effectScope detached + run,
  //   onUpdated fallback, defineAsyncComponent resolve/reject)
  //
  // The remaining ~49 uncov branches are Transition/TransitionGroup class-prop
  // forwarders (each optional prop is a separate ternary arm; ~22 of these),
  // wrapCompatComponent effect-runner unmounted-during-deferred-effect guards,
  // and a few defensive lifecycle re-push arms. The Transition forwarders
  // arms are individually trivial but combinatorial — reaching 95% there
  // would require 11+ targeted tests per Transition variant. Real-Chromium
  // e2e (e2e/compat-layers/vue-compat.spec.ts) exercises the production
  // shapes of these.
  // Ratcheted 95/86 -> 97/92 (measured 97.92/92.72/97.35/99.66). The gap was
  // the COMPONENT-RENDER-CONTEXT half of `watch`: every existing watch test
  // called it at module scope, which takes a different branch entirely, so the
  // hook-slot path (register once, reuse across re-renders, stop on unmount)
  // was unreached for both the single-source and array forms. Covering it also
  // surfaced a real bug — an `immediate` watcher fired TWICE at setup — fixed
  // in the same change.
  coverageThresholds: {
    statements: 97,
    branches: 92,
    functions: 97,
    lines: 99,
  },
})
