---
'@pyreon/native-compiler': patch
---

Normalize numeric arrays passed to chart decimators so integral TypeScript `number[]` values compile as `Double` collections on Swift and Kotlin.
