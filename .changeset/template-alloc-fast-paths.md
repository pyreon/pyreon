---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

Three allocation fast paths in the template/mount hot paths (per-instance closure & array reductions)

- **`@pyreon/compiler`** — a single-binding template returns its disposer
  directly (`return __d0`) instead of a per-instance wrapper closure
  (`return () => { __d0() }`). For the dominant `<For>`-row shape (a sole
  reactive-text child): ~97 B/row → ~948 KB + 10,000 fewer closure allocations
  on a 10k-row list. Both JS + Rust backends, byte-identical.
- **`@pyreon/runtime-dom`** — `_rsCollapseH` uses an inline-first handler-disposer
  slot (no array for the common 0/1-handler collapsed shape): ~57 B/row +
  10,000 fewer array allocations on a 10k single-handler-collapse list.
- **`@pyreon/runtime-dom`** — `mountChildren`'s 3+-child path collects only real
  (non-`noop`) cleanups inline-first instead of `children.map(...)`: no array /
  wrapper closure for child sets yielding ≤1 real cleanup. ~169 B/call → ~1.6 MB
  on 10k mixed 3-child elements (the `h()`/component path).

All behaviour-identical (proven by the existing compiler + runtime-dom suites)
with added bisect-verified regression tests. A fourth candidate (reusing the
batch flush's per-pass `_visitedThisPass` Set) was implemented, measured as a
wash (`Set.clear()` is marginally slower than `new Set()` in V8; the GC benefit
was unmeasurable), and reverted.
