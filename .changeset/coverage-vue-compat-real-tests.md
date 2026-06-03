---
"@pyreon/vue-compat": patch
---

test(vue-compat): add 26 real tests, lift branches 86.47% → 87%

26 new tests in `branch-coverage-real.test.ts` covering ref/shallowRef/triggerRef/unref/toValue contracts, computed readonly throw + writable, reactive/readonly proxy traps (top-level + recursive + delete), toRaw/toRef/toRefs, watch single/array/getter/immediate, effectScope detached + run, onUpdated fallback, defineAsyncComponent resolve/reject paths.

This replaces the closed cosmetic PR #1302 which used `/* v8 ignore */` annotations to cheat 86.47% → 95.57%. Honest real-test gain is modest because most remaining uncov branches are Transition/TransitionGroup class-prop forwarders (each optional prop is its own ternary arm — 11 props × 2 components = 22+ combinatorial branches) and component-wrapper effect-runner unmounted-during-deferred guards reached only in specific multi-render scenarios.

Threshold raised 85 → 86 to lock in the gain.
