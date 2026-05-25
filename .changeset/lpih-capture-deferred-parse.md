---
'@pyreon/reactivity': patch
---

perf(reactive-devtools): close LPIH capture caveat from #913 via deferred `.stack` parsing

The PR-#913-followup caveat ("`_captureCallerLocation` stays gated on `_active` — pre-activate signals lack runtime-captured `loc`") is closed: `_captureCallerLocation` is now always-on in `__DEV__` with a two-phase cost model.

**At capture time** (every dev signal/computed/effect creation): a single cheap `new Error()` allocation (~0.14µs in V8/Bun — stack is captured but NOT formatted). For 10k signals that's ~1.4ms total, invisible.

**At read time** (rare — only when a devtools consumer actually inspects a node): `getReactiveGraph()` / `getFireSummaries()` resolves the deferred handle on demand and memoizes the result on the `NodeRec`. The Error becomes GC-eligible after first resolve.

Most user signals additionally pay 0µs at capture because `@pyreon/vite-plugin`'s `injectSignalLocations` rewrites `signal(0)` → `signal(0, { __sourceLocation })` at build time, short-circuiting the runtime capture path entirely.

Verified end-to-end against `examples/perf-dashboard`: 477/477 (100%) of pre-existing signals get `loc` populated when devtools attaches AFTER mount; the activate-after-creation user workflow + LPIH editor inlay-hint surfaces work uniformly with no eager-`.stack` cost. Production unchanged — the entire instrumentation chain still tree-shakes to dead code under `NODE_ENV=production`.

Internal-only changes; no public API impact. `_captureCallerLocation` now returns a `DeferredLocation` handle instead of a `SourceLocation`, but it's exported under `@internal` and consumed only by framework code via `_rdRegister` (which transparently handles both shapes).
