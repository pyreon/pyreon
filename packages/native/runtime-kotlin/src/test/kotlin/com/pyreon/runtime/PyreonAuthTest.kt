// Smoke tests for PyreonAuth — the pure auth-state machine. Dependency-free
// `check(...)` harness; runs via `verify-kotlin.ts --service=PyreonAuth`.
//
// PyreonAuth is PURE state (no platform edge), so this fully covers the
// container — no "device territory" caveat.

package com.pyreon.runtime

private data class TestUser(val id: Int, val name: String)

fun testAuthInitialSignedOut() {
    val auth = PyreonAuth<TestUser>()
    check(auth.status.value == PyreonAuthStatus.SIGNED_OUT) { "starts signed out" }
    check(auth.user.value == null) { "no user initially" }
    check(auth.error.value == null) { "no error initially" }
    check(!auth.isAuthenticated) { "not authenticated initially" }
    check(!auth.isSigningIn) { "not signing in initially" }
}

fun testAuthRehydratedSession() {
    val auth = PyreonAuth(PyreonAuthStatus.SIGNED_IN, TestUser(1, "ada"))
    check(auth.isAuthenticated) { "rehydrated session is authenticated" }
    check(auth.user.value == TestUser(1, "ada")) { "rehydrated user present" }
}

fun testAuthSignInFlow() {
    val auth = PyreonAuth<TestUser>()
    auth.beginSignIn()
    check(auth.status.value == PyreonAuthStatus.SIGNING_IN) { "beginSignIn → SIGNING_IN" }
    check(auth.isSigningIn) { "isSigningIn true mid-flight" }
    check(!auth.isAuthenticated) { "not authenticated mid-flight" }
    auth.signInSucceeded(TestUser(7, "grace"))
    check(auth.status.value == PyreonAuthStatus.SIGNED_IN) { "success → SIGNED_IN" }
    check(auth.isAuthenticated) { "authenticated after success" }
    check(auth.user.value == TestUser(7, "grace")) { "user set on success" }
    check(auth.error.value == null) { "no error on success" }
}

fun testAuthSignInFailure() {
    val auth = PyreonAuth<TestUser>()
    auth.beginSignIn()
    val boom = RuntimeException("bad credentials")
    auth.signInFailed(boom)
    check(auth.status.value == PyreonAuthStatus.ERROR) { "failure → ERROR" }
    check(auth.error.value === boom) { "error set on failure" }
    check(!auth.isAuthenticated) { "not authenticated after failure" }
    check(auth.user.value == null) { "no user after a failed initial sign-in" }
}

fun testAuthBeginClearsPriorError() {
    val auth = PyreonAuth<TestUser>()
    auth.signInFailed(RuntimeException("first"))
    check(auth.error.value != null) { "error set" }
    auth.beginSignIn()
    check(auth.error.value == null) { "beginSignIn clears prior error" }
    check(auth.status.value == PyreonAuthStatus.SIGNING_IN) { "back to SIGNING_IN" }
}

fun testAuthFailedRefreshKeepsUser() {
    // A failed REFRESH while signed in keeps the prior user visible.
    val auth = PyreonAuth(PyreonAuthStatus.SIGNED_IN, TestUser(1, "ada"))
    auth.beginSignIn() // refresh in flight; user stays
    check(auth.user.value == TestUser(1, "ada")) { "user kept during refresh" }
    auth.signInFailed(RuntimeException("refresh failed"))
    check(auth.status.value == PyreonAuthStatus.ERROR) { "refresh failure → ERROR" }
    check(auth.user.value == TestUser(1, "ada")) { "failed refresh keeps the prior user" }
}

fun testAuthSignOutClearsEverything() {
    val auth = PyreonAuth(PyreonAuthStatus.SIGNED_IN, TestUser(1, "ada"))
    auth.signOut()
    check(auth.status.value == PyreonAuthStatus.SIGNED_OUT) { "signOut → SIGNED_OUT" }
    check(auth.user.value == null) { "signOut clears user" }
    check(auth.error.value == null) { "signOut clears error" }
    check(!auth.isAuthenticated) { "not authenticated after signOut" }
}

fun testAuthFullCycle() {
    val auth = PyreonAuth<TestUser>()
    auth.beginSignIn(); auth.signInSucceeded(TestUser(1, "a"))
    check(auth.isAuthenticated) { "signed in" }
    auth.signOut()
    check(!auth.isAuthenticated) { "signed out" }
    auth.beginSignIn(); auth.signInFailed(RuntimeException("x"))
    check(auth.status.value == PyreonAuthStatus.ERROR) { "second attempt failed" }
    auth.beginSignIn(); auth.signInSucceeded(TestUser(2, "b"))
    check(auth.isAuthenticated && auth.user.value == TestUser(2, "b")) { "recovered + signed in" }
}

fun testAuthReactiveFieldShapes() {
    val auth = PyreonAuth<TestUser>()
    for (name in listOf("status", "user", "error")) {
        val t = auth::class.members.first { it.name == name }.returnType.toString()
        check(t.contains("MutableState")) { "$name MUST be a Compose MutableState. Actual: $t" }
    }
    val authedType = auth::class.members.first { it.name == "isAuthenticated" }.returnType.toString()
    check(authedType == "kotlin.Boolean") {
        "isAuthenticated must return plain kotlin.Boolean. Actual: $authedType"
    }
}

fun main() {
    testAuthInitialSignedOut()
    testAuthRehydratedSession()
    testAuthSignInFlow()
    testAuthSignInFailure()
    testAuthBeginClearsPriorError()
    testAuthFailedRefreshKeepsUser()
    testAuthSignOutClearsEverything()
    testAuthFullCycle()
    testAuthReactiveFieldShapes()
    println("[PyreonAuthTest] all smoke tests passed")
}
