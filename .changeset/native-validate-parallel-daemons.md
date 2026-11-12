---
'@pyreon/native-compiler': patch
---

The Kotlin validation harness starts one warm compiler JVM per vitest worker instead of one per run, so the package's test files run in parallel (they were serialized behind the single JVM). `startSharedKotlinDaemon` is replaced by `startSharedKotlinDaemons(count, …)`, and `PYREON_KOTLIN_DAEMON_SPOOL` now carries one spool path per worker slot. The verdict cache gains the `swift-real-runtime` kind for typechecks against the real iOS SDK with the shipped runtime sources.
