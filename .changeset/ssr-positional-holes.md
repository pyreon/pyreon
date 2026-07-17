---
'@pyreon/runtime-server': patch
---

perf(ssr): `_ssr` / `_ssrItem` take positional hole params — ~7% off a 1000-row SSR render

The compiled SSR fast path builds each row through `_ssrItem(statics, h0, h1, …)`.
Both entries declared their holes as a rest array, allocating one throwaway array
per call — 1000 per 1000-row render — and then walking them through a generic
per-hole dispatch loop.

A CPU profile at 1000 rows attributed ~21.6% of self time to that walk, against a
Vue profile that is ~44% irreducible `escapeHtml` with no equivalent loop at all.
Both entries now take positional hole params (`a..f` + a trailing `...rest`) with a
fused all-string fast path, measured at **~7% off the whole render** (median
203.6 → 188.8 µs; 8/8 paired passes, lead order alternated).

Byte-identical by construction: any non-string hole (a nested `RawHtml`, an async
`Promise`) or an arity past the fused arms falls through to the unchanged generic
walk, and the fast path keys on the hole count actually passed — not on
`statics.length` — so it reproduces the previous behaviour exactly, including the
arity-mismatch shapes the compiler never emits.

Call sites are unchanged (the compiler already emits holes positionally), so there
is no compiler change, no emit change, and no Rust-backend mirror.
