---
'@pyreon/native-runtime-kotlin': patch
---

Build tooling: the per-service Kotlin verification list is now DERIVED from the sources and runs in parallel with a content-addressed verdict cache, replacing three hand-maintained `&&` chains that had drifted (8 services were verified by only one of `build` / `test` / `typecheck`).

No shipped content changes — the package's `files` is `src`, `README.md`, `LICENSE`, and only `scripts/` and `package.json`'s script strings were touched.
