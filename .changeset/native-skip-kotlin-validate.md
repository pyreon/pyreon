---
'@pyreon/native-compiler': patch
---

`PYREON_SKIP_KOTLIN_VALIDATE=1` makes Kotlin validation skip explicitly, so a Swift-only CI job no longer starts hundreds of cold `kotlinc` compiles just because its runner image ships `kotlinc`.
