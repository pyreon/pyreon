import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  environment: 'happy-dom',
  includeIndexInCoverage: true,
  coverageExclude: ['src/tests/**'],
  // Threshold history (post v8-ignore campaign cleanup):
  // - Pre-PR-1300 honest baseline: 88.21% branches (verified by removing all
  //   v8-ignores and re-running)
  // - PR #1300 cosmetically lifted to 95.33% by adding 19 /* v8 ignore */
  //   annotations (later identified as gaming the gate, not real coverage)
  // - Current: 89.56% branches via 35 REAL tests in branch-coverage-real.test.ts
  //   covering createEffect undefined-return, mergeProps/splitProps descriptor
  //   paths, useContext native-context branch, createStore single-fn form,
  //   createResource stale-discard, filter-predicate setStore, DANGEROUS_KEYS
  //   protection. Beats pre-cosmetic baseline by +1.35pp honestly.
  //
  // The remaining ~17 uncov branches are defensive guards reachable only
  // through internals (proxy ownKeys/getOwnPropertyDescriptor combinatorial
  // arms, deep applyAtPath with empty path × non-fn value, stale-rejection
  // signal-eviction sweep). Reaching 95% would require refactoring out the
  // genuinely-dead defensive arms — a separate cleanup PR.
  // Ratcheted 95/89 -> 96/91 (measured 96.68/91.77/97.22/98.28) by covering
  // `setStore`'s path forms, `createResource`'s staleness guards and the store
  // proxy's traps over a vanished path — which surfaced a real bug: a
  // store-wrapped ARRAY threw on `JSON.stringify` and reported false for
  // `Array.isArray`, fixed in the same change.
  //
  // 91 rather than 92 is the honest ceiling for the node run. Of the 25
  // branches left, four are `NODE_ENV !== 'production'` arms and most of the
  // rest are defensive arms no caller can reach: `safeAssign`'s zero-length
  // path (the dispatcher only ever produces a path of length >= 1 or takes the
  // draft form), the `!desc` continues (`Object.getOwnPropertyDescriptors`
  // never yields a key without one), and the SYNC half of the fetch-version
  // check (nothing can interleave before a synchronous throw is caught).
  // Raise this when one of them becomes reachable, not by covering it.
  //
  // Branches ratcheted 91 -> 92 by the 92%+ campaign (measured 92.10), which
  // clears the repo-wide bar. The single arm that got it there is the one
  // that mattered: `scheduleEffects` defers into a microtask, so a component
  // can unmount before its effects run, and the guard inside that loop is
  // what stops an effect executing against a torn-down context. The failure
  // is silent — the effect subscribes, or times, or writes into a disposed
  // owner, and nothing says so.
  //
  // The arms still uncovered around it are UNREACHABLE through the shipped
  // API rather than untested: nothing pushes to `pendingLayoutEffects`, and
  // `onMount`'s wrapper returns `undefined` unconditionally, so a stored
  // cleanup is never a function. Same for `safeAssign` and its zero-length
  // path — `setStore` dispatches either the draft form or a path form whose
  // path is always >= 1 segment. Covering any of those would mean calling
  // internals directly, which asserts nothing about a consumer.
  coverageThresholds: {
    statements: 96,
    lines: 98,
    branches: 92,
    functions: 97,
  },
})
