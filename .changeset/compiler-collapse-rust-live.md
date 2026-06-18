---
'@pyreon/compiler': patch
---

Rocketstyle-collapse now RUNS on the Rust backend in production (PR 5/N — the
live-enabling step that completes the port). The JS `transformJSX` dispatcher no
longer force-routes collapse builds to the JS path; it lowers the
`collapseRocketstyle` config from its `Set`/`Map` shape to the napi array/Record
shape (`toNativeCollapse`) and threads it as `transformJsx`'s 6th arg. The native
backend implements all four collapse variants byte-identically (locked by the
cross-backend equivalence suite), so a collapse build now gets the native
backend's 3.7-8.x× transform speed instead of falling back to JS.

Output is unchanged (the feature is opt-in via `pyreon({ collapse: true })` and
the emit is byte-for-byte identical across backends) — only the backend that
produces it changes. The JS path remains the graceful fallback when the native
binary is unavailable (it still reads the `Set`/`Map` config directly).

Verified: full compiler suite 1571/1571; the `verify-modes ui-showcase × spa`
collapse cell (real `vite build`, `pyreon({ collapse: true })`) builds the
rs-collapse / dyn / elem probes through the native backend and the
collapse-exclusive fingerprints hold. Bisect-verified: feeding native empty
`candidates` makes the cell fail with the raw (non-collapsed) Button mount,
proving the native+config path is what drives the real-build collapse; restored
→ green.
