---
"@pyreon/native-runtime-kotlin": patch
---

Require working native tools before accepting cached smoke results in strict validation. Keep compile-only results separate from executed tests, preserve skipped-smoke diagnostics, discard legacy records that could have hidden an unrun test, and invalidate executed-smoke verdicts when the Java runtime changes independently of the compiler JDK.
