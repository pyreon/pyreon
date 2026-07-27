---
'@pyreon/create-multiplatform': patch
---

Document the `useNativeModule` escape hatch in the scaffolded README.

A new multiplatform app had no indication that it can add a platform capability
the framework does not ship — Bluetooth, ARKit, a vendor SDK — so the natural
conclusion from the scaffold was that the built-in hook set is the ceiling and a
missing capability means waiting for a framework release.

The scaffolded README now shows the shape end to end: `defineNativeModule` for
the web implementation, `useNativeModule` at the call site, and the two platform
halves with the contract that is easy to get wrong (a NO-ARGUMENT initialiser on
Swift, a SINGLE `Context` parameter on Kotlin, and the Kotlin class declared in
the generated sources' package since the emit references it unqualified).

Locked by a test asserting the README carries the contract, not just the name —
bisect-verified.
