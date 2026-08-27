---
'@pyreon/native-cli': patch
---

`useStorage` now builds on Android — `rememberSaveable` was missing its import

The hook lowers to `rememberSaveable { … }`, which lives in
`androidx.compose.runtime.saveable` — a SUB-package the unconditional
`androidx.compose.runtime.*` star import cannot reach, since Kotlin star imports
are single-package. So `useStorage` had never built in a real Android app.

The kotlinc stub declares `rememberSaveable`, so every validate-loop check
resolved it, and no gated example used the hook — the device gate was the only
thing that could catch it, and did:
`Unresolved reference 'rememberSaveable'`.
