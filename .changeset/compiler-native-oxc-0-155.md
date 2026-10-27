---
'@pyreon/compiler': patch
---

The native (Rust) JSX backend moves to `oxc_*` 0.155 and `napi` 3.15, matching the `oxc-parser` 0.155 the JS backend already uses, so both backends parse with the same oxc release.
