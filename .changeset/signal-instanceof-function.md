---
'@pyreon/reactivity': patch
---

fix(reactivity): restore `signal instanceof Function === true` (regression introduced by SignalProto shared-proto allocation)

When the `SignalProto` shared-allocation optimization landed, `SignalProto` was declared as a bare object literal `{ peek, set, update, ... }`. An object literal's `[[Prototype]]` is `Object.prototype`, so `Object.setPrototypeOf(read, SignalProto)` produced the chain `read → SignalProto → Object.prototype`. The read function used to have `Function.prototype` as its `[[Prototype]]` (every function does), so the result was: **every signal silently lost `instanceof Function === true`** (was `true` pre-optimization, became `false`).

This is a silent breaking change across the ecosystem. Consumers using `x instanceof Function` to discriminate signals from plain values include perf-harness, devtools, the framework's own compiler helpers, third-party libraries, and user code. All of them silently flipped to the opposite branch.

**Fix**: one line — `Object.setPrototypeOf(SignalProto, Function.prototype)` after the SignalProto declaration. Restores the full chain `read → SignalProto → Function.prototype → Object.prototype`. The monomorphic shared-proto allocation win is preserved (still one shared proto object; still one `setPrototypeOf` per signal).

Surfaced by an audit of all framework commits since v0.25.1 (sequential 7-agent workflow). Bisect-verified: reverting the new `setPrototypeOf` line makes 2 of 4 regression specs fail with `AssertionError: expected false to be true` for `s instanceof Function` and `AssertionError: expected {} to be [Function]` for the prototype-chain check. Restoring the line returns the suite to 461/461 green.

Regression coverage in `packages/core/reactivity/src/tests/signal.test.ts` — 4 specs covering `signal instanceof Function`, `computed instanceof Function`, the prototype-chain shape, and a sanity check that method dispatch through the chain still works.
