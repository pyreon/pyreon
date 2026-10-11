---
"@pyreon/native-runtime-kotlin": patch
---

Require working native tools before accepting cached smoke results in strict validation. Keep compile-only results separate from executed tests, preserve skipped-smoke diagnostics, and discard legacy records that could have hidden an unrun test.
