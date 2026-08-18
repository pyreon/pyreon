---
'@pyreon/compiler': minor
'@pyreon/runtime-dom': minor
---

Stop allocating a per-row closure that the `_bindText`/`_bindDirect` fast path throws away

For a member-expression callee (`{row.label()}` — the dominant `<For>` row shape) the compiler emitted a `caller` thunk: `_bindText(row.label, __t2, () => row.label())`. That argument exists solely so the runtime's SLOW path can preserve `this` when `source` turns out to be a plain method rather than a signal — the fast path (`source.direct`) returns before ever reading it. So every signal-backed member text/attribute binding allocated one closure per row and immediately discarded it.

The emit now passes the RECEIVER instead: `_bindText(row.label, __t2, undefined, row)`. `row` is an identifier already in scope, so the argument costs no allocation, and the runtime rebuilds the call with `.call(receiver)` only if it actually reaches the slow path. Both backends emit byte-identically.

Scope and limits:

- The receiver occupies its OWN positional slot rather than sharing the third with the thunk, because **a receiver can itself be callable** — `typeof x === 'function'` cannot tell a receiver from a thunk, so one shared slot would invoke the receiver instead of the method (a callable store's `store.getState()` would render the store's own return value).
- Only depth-1 chains (`row.label()`) use the receiver. Deeper chains (`row.data.name()`) deliberately keep the thunk, because passing their receiver would mean evaluating `row.data` a second time at the call site and could double-fire a getter.
- Bare-identifier signals (`{count()}`) were already on the 2-arg form and are unchanged.
- The slot-3 thunk is still honoured, so a runtime can serve output from an older compiler without silently breaking `this`.
- Wall-clock is a wash: the eliminated allocation is real and structurally visible in the emit, but it sits below measurement resolution (repeated interleaved runs over 10,000 rows produced deltas of both signs, −2.9% to +9.5%). This ships as a defect fix, not a speedup.
