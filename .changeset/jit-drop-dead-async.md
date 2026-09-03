---
'@pyreon/validate': patch
---

Stop emitting async-deferral machinery into JIT validators that can never
defer.

A fallback arm is the only subtree that can return a Promise — jit.ts says so
itself at the pending-list barrier ("A fallback is the ONLY subtree that can
return a Promise"). But the array codegen set `usesAsyncMachinery` for *any*
inline array, because it referenced the pending list `A` for slot bookkeeping
in its own-check guard. So every array- or array-bearing-object schema carried
the deferral machinery on every parse, whether or not the tree contained a
fallback at all: three prelude initialisers, a `NOOP` closure literal, a
baseline slot count, and a live `Promise.all` ternary on both the array's
own-check branch and every return.

`compileJit` now takes `emitAsync` and re-enters itself once with it disabled
when the walk has proven `!hasFallback` — the same condition that already sets
the `_jitPure` brand. Re-entering rather than pre-scanning is deliberate:
`hasFallback` is only known *after* the walk, and inlinability is decided in
exactly one place in this file, so a pre-scan would mean a second copy of that
decision that could drift from the real one.

Emit for `s.array(s.object({ id, name }))`, before → after: the `var A = null;
var B = null; var NOOP = () => {};` prelude is gone, the `let t4 = A === null ?
0 : A.length` slot baseline is gone, the four-branch own-check collapses to
`if (ctx.issues.length === t3) { … }`, and the root return goes from a
`Promise.all` ternary to `return t0;`. Still `_jitPure: true`.

This is a codegen-shape change, and it is deliberately not being published with
a speedup figure — no measurement was taken, because every window available
while writing it sat at load 8–500 on a machine running seven concurrent
sessions, far above the `load < 3` bar this repo's bench protocol requires.
What can be stated without a stopwatch: the removed statements were provably
unreachable on the trees they were emitted into, and jit.ts's own existing
comment records this same elision as "measured ~10% faster" for the
scalar/flat-object shapes the flag already happened to spare. Treat that as
prior art in this file, not as a measurement of this change.

Locked by `jit-pure-no-async-machinery.test.ts`. Those are source-shape
assertions on purpose: the three differential suites (`jit-differential`,
`jit-async-differential`, `pure-seam-differential`) pass whether or not the
dead machinery is emitted, which is exactly why the elision needs a test of its
own — without one, re-broadening the flag is a silent regression with nothing
failing. Bisect-verified: reverting the gating fails four specs with `expected
… not to contain 'var A = null'` / `'Promise.all'` / `/return A === null \?/`,
restoring passes 9/9. The fallback-bearing half of the suite asserts the
machinery is still emitted *and* still resolves and rejects correctly through
`parseAsync`, so the elision cannot quietly widen to trees that need it.
