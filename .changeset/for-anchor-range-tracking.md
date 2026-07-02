---
'@pyreon/runtime-dom': patch
---

For/keyed-list reconcilers: replace the module-level anchor `WeakSet` registries with per-entry `[anchor..end]` range tracking. Fixes a permanent retained-heap high-water (V8 never shrinks a WeakSet backing table — 256KB after a 10k-row session, the entire retained-memory delta vs Solid on the krausest-style bench: 3.16MB → 2.90MB), removes a per-row `WeakSet.add` from the create path, and makes multi-node entry moves exact-range instead of neighbor-sniffing.
