// Smoke tests for PyreonBiometrics — the Compose `useBiometrics` biometric
// gate. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonBiometrics`.
//
// `authenticate(reason)` is a `suspend` fun and the runtime avoids a
// kotlinx.coroutines dependency (no `runBlocking`), so the test drives it with
// kotlin-stdlib coroutine primitives (`startCoroutine`). The v1 scaffold
// completes synchronously (returns false without suspending), so the
// continuation fires inline and `done` is set before we read the result.

package com.pyreon.runtime

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

private fun runSuspend(block: suspend () -> Boolean): Boolean {
    var out = false
    var done = false
    block.startCoroutine(
        Continuation(EmptyCoroutineContext) { result ->
            out = result.getOrThrow()
            done = true
        },
    )
    check(done) { "authenticate() did not complete (v1 scaffold resolves synchronously)" }
    return out
}

fun testAuthenticateResolvesFalseInV1() {
    val bio = PyreonBiometrics()
    val ok = runSuspend { bio.authenticate("Unlock to continue") }
    check(!ok) { "v1 scaffold authenticate() resolves to false (real BiometricPrompt is a follow-up)" }
}

fun testAuthenticateIsCallableWithAnyReason() {
    val bio = PyreonBiometrics()
    // Distinct reason strings are accepted (the prompt copy is caller-provided).
    check(!runSuspend { bio.authenticate("") }) { "empty reason accepted" }
    check(!runSuspend { bio.authenticate("Confirm payment") }) { "arbitrary reason accepted" }
}

fun main() {
    testAuthenticateResolvesFalseInV1()
    testAuthenticateIsCallableWithAnyReason()
    println("[PyreonBiometricsTest] all smoke tests passed")
}
