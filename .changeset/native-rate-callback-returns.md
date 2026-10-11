---
"@pyreon/native-compiler": patch
---

Emit rate-limited Kotlin callbacks with a local return label and Unit return semantics. Concise callbacks, returned mutations and early returns now compile without illegal non-local returns. Returned expressions still execute for their side effects.
