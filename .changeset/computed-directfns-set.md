---
'@pyreon/reactivity': patch
---

Fix: `computed.direct()` no longer leaks (and no longer degrades `recompute`) under register/dispose churn.

`computed`'s `directFns` was a flat array whose disposer only nulled the slot (`arr[idx] = null`) and never compacted. A long-lived computed (a derived theme/locale/auth value, or one read inside churning `<For>` rows) whose direct updaters register and dispose repeatedly therefore accumulated one **permanent dead slot per ever-registered binding** — app-lifetime memory growth — AND made `recompute` iterate **O(total-ever-registered)** instead of O(live), on the compiler-emitted `_bindText`/`_bindDirect` notify path.

This is the **exact bug class already fixed for `signal._d`** (`signal.ts` `_directFn`, shipped + e2e-verified in #612). `computed` was simply left on the broken array pattern. Fix: `directFns` is now a `Set` (same as `signal._d` / `host._s`) — O(1) add/delete, O(live) iteration, bounded growth.

`computed` now also exposes the live set as an `@internal` `_d` accessor (mirroring `signal._d`) purely so the regression is deterministically assertable.

**Verification.** New regression test: 10 000 `computed.direct()` register+dispose cycles on a long-lived computed → asserts the live set stays `size 0` (bounded), one live binding → `size 1` and still fires, disposed → `size 0` and not invoked. Bisect-verified: reverting to the array form fails the test (`_d` is an array → `.size` undefined); restored → 295/295 reactivity tests pass. `bun run coverage` exit 0 (`@pyreon/reactivity` 94.64 %); lint + typecheck clean. e2e coverage is inherited from the structurally-identical `signal._d` Set conversion already validated end-to-end in #612 (same compiler-binding notify path).
