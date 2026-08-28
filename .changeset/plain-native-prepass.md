---
'@pyreon/compiler': minor
---

Plain Mode pre-pass, native: a Rust mirror of `transformPlain` in the napi binary (`transformPlain` export). `transformJSX` prefers it when the loaded binary ships the export — older per-platform binaries fall back to the JS implementation transparently, and the JS implementation remains the oracle. Byte-equality (output code and the full warnings array) is locked by a cross-backend differential suite: a 31-shape corpus covering every dialect feature plus a seeded grammar fuzz (300 seeds in CI; a 10,000-seed sweep ran clean).
