// PyreonBiometrics — the Compose side of Pyreon's biometric-gate service
// (M3.5). Mirrors the Swift `PyreonBiometrics` one-for-one + the core
// `@pyreon/hooks` `useBiometrics` shape.
//
// Surface:
//
//     val ok = bio.authenticate("Unlock to continue")  // inside a coroutine
//
// `authenticate(reason)` is a `suspend` fun. PMTC lowers a `const ok = await
// bio.authenticate(...)` inside an `async` handler to a
// `pyreonAsyncScope.launch { val ok = bio.authenticate(...) }` (the M4.5
// lowering; Kotlin suspend calls carry no `await` keyword).
//
// The platform decision lives behind `PyreonBiometricGate`, so this file stays
// free of `android.*` and its contract test RUNS on a plain JVM (a module that
// imports the Android SDK is skipped by the Kotlin test runner). The real gate,
// `androidx.biometric`'s BiometricManager + BiometricPrompt, is
// `PyreonBiometricsAndroid.kt`; `useBiometrics()` lowers to its
// `PyreonBiometrics(context)` factory.
//
// Until 2026-11 this class was a scaffold that returned false from both
// methods, so the Android "denied" device test could not fail (#4569).

package com.pyreon.runtime

/** The platform side of the biometric gate. */
public interface PyreonBiometricGate {
    /** Whether a biometric authenticator is present AND enrolled. */
    public fun isAvailable(): Boolean

    /** Show the system prompt; true only when the user authenticated. */
    public suspend fun prompt(reason: String): Boolean
}

/** No authenticator at all: what a bare `PyreonBiometrics()` (no Context) uses. */
public object UnavailableBiometricGate : PyreonBiometricGate {
    override fun isAvailable(): Boolean = false

    override suspend fun prompt(reason: String): Boolean = false
}

public class PyreonBiometrics(private val gate: PyreonBiometricGate = UnavailableBiometricGate) {
    /**
     * Resolves true only when the user authenticated. With no enrolled
     * authenticator it resolves false WITHOUT showing a prompt, matching the
     * iOS `canEvaluatePolicy` guard, so an unenrolled device never hangs on a
     * prompt that cannot succeed.
     */
    public suspend fun authenticate(reason: String): Boolean {
        if (!gate.isAvailable()) return false
        return gate.prompt(reason)
    }

    /**
     * Whether a platform biometric authenticator is present and enrolled. The
     * web hook has exposed this since inception (`isAvailable: () => boolean`).
     */
    public fun isAvailable(): Boolean = gate.isAvailable()
}
