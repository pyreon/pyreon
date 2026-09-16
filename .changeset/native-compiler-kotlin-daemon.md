---
'@pyreon/native-compiler': minor
---

Kotlin validation runs on a warm, in-process compiler instead of one cold `kotlinc` per check.

`validateKotlin` spawned `kotlinc` for every emit: a fresh JVM, the whole Compose stub file re-analysed, codegen to a throwaway directory — ~4s per check here, ~6s on a two-core CI runner, and ~600 checks per suite run. The compile-verdict cache could not absorb it because any stub edit legitimately invalidates every Kotlin verdict, and the stubs change most days.

Now one compiler JVM serves the whole run (`K2JVMCompiler` kept loaded, the stubs compiled once into a jar on the classpath), fed through a spool directory so the synchronous validator can wait on it; a vitest `globalSetup` starts it once per run and workers attach by pid. Measured: ~78ms per check warm against 4.2s cold; the Kotlin share of a seven-file serial run went from ~36s to ~4s. Every failure — no `java`, no compiler jar beside `kotlinc`, a JVM that never reports ready, a request past the compile timeout — falls back to the per-check `kotlinc` path, so the verdict is never a second source of truth: a parity spec compiles the same shapes both ways and asserts identical outcomes and diagnostics. `PYREON_KOTLIN_DAEMON=0` forces the plain path.
