---
'@pyreon/table': patch
'@pyreon/virtual': patch
---

Bench-only: both wall-clock benches now measure the REAL compiled path (`pyr-tpl` — the fixture compiled through `transformJSX` + esbuild automatic JSX runtime, what vite-plugin apps ship) alongside the hand-`h()` transparency column, with untimed real-DOM correctness gates on every cell. No shipped runtime code changed. Measured outcome: virtual's steady-state scroll is 1.3× faster than react-virtual on the compiled path; table's ~2× mount gap is confirmed as per-cell reactive-binding setup (the compiled fixture closes only ~10% of it), not an h() harness artifact.
