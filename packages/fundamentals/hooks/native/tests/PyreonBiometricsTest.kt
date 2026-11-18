// Contract tests for PyreonBiometrics — the Compose `useBiometrics` gate.
// Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonBiometrics`.
//
// `authenticate(reason)` is a `suspend` fun and the runtime avoids a
// kotlinx.coroutines dependency (no `runBlocking`), so the test drives it with
// kotlin-stdlib coroutine primitives (`startCoroutine`). The fake gates below
// complete synchronously, so the continuation fires inline.
//
// Each case is decided by the GATE's answer, so every assertion can fail: the
// v1 scaffold returned false whatever happened, and a test written against it
// could not tell a working denial path from no path at all (#4569).

package com.pyreon.runtime

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

private fun runSuspend(block: suspend () -> Boolean): Boolean {
    var out: Boolean? = null
    block.startCoroutine(Continuation(EmptyCoroutineContext) { result -> out = result.getOrThrow() })
    return checkNotNull(out) { "authenticate() did not complete" }
}

private class FakeGate(private val available: Boolean, private val userAccepts: Boolean) : PyreonBiometricGate {
    val prompted = mutableListOf<String>()

    override fun isAvailable(): Boolean = available

    override suspend fun prompt(reason: String): Boolean {
        prompted.add(reason)
        return userAccepts
    }
}

fun testAuthenticatedUserResolvesTrue() {
    val gate = FakeGate(available = true, userAccepts = true)
    check(runSuspend { PyreonBiometrics(gate).authenticate("Unlock to continue") }) {
        "a user who authenticated must resolve true"
    }
    check(gate.prompted == listOf("Unlock to continue")) { "the prompt must carry the caller's reason" }
}

fun testRejectedUserResolvesFalse() {
    val gate = FakeGate(available = true, userAccepts = false)
    check(!runSuspend { PyreonBiometrics(gate).authenticate("Confirm payment") }) {
        "a cancelled or failed prompt must resolve false"
    }
    check(gate.prompted.size == 1) { "an available gate must show the prompt" }
}

fun testUnavailableGateResolvesFalseWithoutPrompting() {
    val gate = FakeGate(available = false, userAccepts = true)
    check(!runSuspend { PyreonBiometrics(gate).authenticate("Unlock") }) {
        "no enrolled authenticator must resolve false, even if a prompt would have accepted"
    }
    check(gate.prompted.isEmpty()) { "an unenrolled device must not be shown a prompt that cannot succeed" }
}

fun testIsAvailableReportsTheGate() {
    check(PyreonBiometrics(FakeGate(available = true, userAccepts = false)).isAvailable()) { "available gate" }
    check(!PyreonBiometrics(FakeGate(available = false, userAccepts = false)).isAvailable()) { "unavailable gate" }
    check(!PyreonBiometrics().isAvailable()) { "the context-free default has no authenticator" }
}

fun main() {
    testAuthenticatedUserResolvesTrue()
    testRejectedUserResolvesFalse()
    testUnavailableGateResolvesFalseWithoutPrompting()
    testIsAvailableReportsTheGate()
    println("[PyreonBiometricsTest] all contract tests passed")
}
