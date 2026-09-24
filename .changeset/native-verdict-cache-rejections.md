---
'@pyreon/native-compiler': patch
---

The compile-verdict cache caches rejections again, and skips only failures the
compiler never delivered. A previous change stopped caching every failed
validate call on the theory that a failure may be environmental — but roughly
half the native suite is "does NOT compile" specs, so every one of those ran a
cold `swiftc`/`kotlinc` on every run: a permanent 25-minute CI cell, killed by
its cap. Transient failures are now classified by the process's SHAPE (no exit
status, a signal, or an errno — a spawn failure, an OOM kill, a timeout) and
passed through uncached; a non-zero exit with diagnostics is the compiler's
judgement and is cached exactly like a success. Legacy stored rejections are
kept when their text is visibly compiler output, so the store main already
saved stays warm.
