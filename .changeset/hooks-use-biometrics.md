---
'@pyreon/hooks': minor
---

Add `useBiometrics()` — a biometric authentication gate (Face ID / Touch ID on iOS `LAContext`, BiometricPrompt on Android, feature-detected on the web). The FIRST hook with an ASYNC RESULT: `authenticate(reason)` returns a `Promise<boolean>` you `await`. Under PMTC it lowers to the native biometric APIs and the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. On the web v1 a real assertion is a WebAuthn ceremony (needs a server-issued challenge + a registered credential), so `authenticate` resolves `false` and `isAvailable()` feature-detects `window.PublicKeyCredential` — native is the primary target.
