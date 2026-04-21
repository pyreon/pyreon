---
"@pyreon/compiler": minor
---

Rewrite the reactive JSX transform in Rust (napi-rs) for 3.7-8.9x faster compilation. The native binary auto-loads when available, falling back to the JS implementation transparently. All 527 tests pass across both backends.
