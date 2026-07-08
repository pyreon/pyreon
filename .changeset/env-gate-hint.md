---
"@pyreon/zero": patch
---

`zero({ env })` build-gate failures now name the `ZERO_PUBLIC_` prefix fix. A missing public var previously failed with a bare "required but not set", which is confusing when the var IS set but without the prefix (so it stays private and never reaches the gate). The message now spells out that public vars need the `ZERO_PUBLIC_` prefix in `.env` and secrets belong in server-side `validateEnv()`.
