---
'@pyreon/compiler': patch
---

perf(ssr): fuse per-item row bodies into a direct concat — Pyreon is now the fastest SSR renderer at every list size

The compiled SSR fast path built every `<For>` row and every `.map` item through an
`_ssrItem(statics, …holes)` call: a per-item statics array, a per-item call, and a
generic per-hole dispatch walk. A CPU profile at 1000 rows attributed ~21.6% of self
time to that walk, against a Vue profile that is ~44% irreducible `escapeHtml` with no
equivalent loop at all — Vue's compiler emits one fused string build per row.

Both item paths now emit that same shape: each hole binds to a temp, then the statics
and temps concat inline. Only holes that are not provably `string` are guarded
(`_ssrAttr`/`_ssrAttrGen`/`_ssrAttrUrl` are declared `: string`); when a guard fails —
an async `_esc`, or a `RawHtml` from a nested `_ssrChildren`/`_ssrForKeyed` — the item
falls back to the UNCHANGED `_ssrItem` call, so byte-identity and the async promotion
path are preserved by construction.

Measured on the cross-framework SSR bench (paired passes, lead alternated, real
compiler):

- `<For>` list: **+29.2%** at 1000 rows (198.2 → 140.4 µs), +27.4% at 100, +14.9% at 10
- `.map` list: **+30.7%** at 1000 rows (179.5 → 124.4 µs)

Against `vue/server-renderer` on the same box: 1000 rows 134.8 µs vs 141.2 µs (CI95
non-overlapping, 9/9 paired) — previously ~1.24× behind. Pyreon now leads at 10, 100
and 1000 rows.

Emitted byte-for-byte identically by both compiler backends (JS + Rust native).
