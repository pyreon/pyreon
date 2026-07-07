---
"@pyreon/reactivity": minor
---

Add `signal.trigger()` — force subscribers to re-run WITHOUT changing the value.

Signals gate on `Object.is`, so `set(sameReference)` is a no-op — which means
mutating a held object IN PLACE (a `Map`, a class instance, an external store
like a TanStack table) and re-setting the same reference never re-renders.
`trigger()` is the escape hatch: mutate the object, then call `trigger()` to
re-run everything that read the signal (Vue's `triggerRef` semantic, and the
signal-side counterpart to `computed(fn, { equals })`).

Zero cost on the default path: it's a shared `SignalProto` method (no per-signal
field or memory change) and it duplicates `set()`'s batch-aware notify block
rather than refactoring it, so the hot write path stays byte-identical.
`wrapSignal` facades forward it to their base. Prefer immutable `set(newObject)`
when practical; reach for `trigger()` only when you deliberately own a mutable
value.
