---
'@pyreon/native-runtime-kotlin': patch
---

The Kotlin co-source gate reports whether the behaviour test actually RAN

`verify-kotlin` builds a JAR and runs its smoke `main()` through `java`. With no
JDK on PATH it degrades to compile-only, warns on stdout, and exits 0 —
and `check-native-cosource` discards a successful child's stdout, then reported
`(compiled + ran test)` purely because a `*Test.kt` FILE existed.

So on any machine without a JDK, every Kotlin behaviour assertion in the repo
was typecheck-only while the log said otherwise. Measured on a macOS laptop:
**43 of them.** The warning that was supposed to prevent this was added after a
`@pyreon/flow` selectAll/deleteSelected divergence shipped past exactly this
line — it just had nowhere to be seen.

Three changes: the skip marker is a shared token both halves read; the gate
reports the outcome it observed rather than the one the file layout implies; and
`smokeRuns` joins the verdict-cache key, so a compile-only pass can no longer be
replayed as a behaviour pass (the cache is restored across CI runs, so one
JDK-less runner would have retired the behaviour tests permanently). The ubuntu
CI step now sets `PYREON_REQUIRE_NATIVE_VALIDATE=1`, making a missing JVM a
broken runner rather than a passing gate.

Note this invalidates existing cached verdicts once — the key gained a
component, so every Kotlin co-source verdict is re-derived on the next run.
