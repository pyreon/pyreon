// PyreonBiometrics — the Compose side of Pyreon's biometric-gate service
// (M3.5). Mirrors the Swift `PyreonBiometrics` one-for-one + the core
// `@pyreon/hooks` `useBiometrics` shape.
//
// Surface:
//
//     val ok = bio.authenticate("Unlock to continue")  // inside a coroutine
//
// `authenticate(reason)` is a `suspend` fun — the first Pyreon service with
// an async RESULT a consumer awaits. PMTC lowers a `const ok = await
// bio.authenticate(...)` inside an `async` handler to a
// `pyreonAsyncScope.launch { val ok = bio.authenticate(...) }` (the M4.5
// lowering; Kotlin suspend calls carry no `await` keyword).
//
// v1 SCAFFOLD. The real Android gate is `androidx.biometric`'s
// `BiometricPrompt`, which needs a `FragmentActivity` + an `Executor` + an
// `AuthenticationCallback` bridged to a coroutine via
// `suspendCancellableCoroutine` — a follow-up (it also needs the emit to
// inject a `FragmentActivity`, which the current `LocalContext.current`
// injection does not reach). This v1 keeps the runtime dependency-free
// (kotlin-stdlib only — no kotlinx.coroutines, matching PyreonFetch) and
// resolves to `false` so the async lowering + the emit compile end-to-end on
// Android. The `suspend` modifier is intentionally retained to match the
// real (suspending) BiometricPrompt bridge the follow-up installs.

package com.pyreon.runtime

class PyreonBiometrics {
    @Suppress("RedundantSuspendModifier")
    suspend fun authenticate(reason: String): Boolean {
        return false
    }
}
