// PyreonAuth — the Compose side of Pyreon's cross-platform authentication
// story (Tier 1). Mirrors a web `useAuth` reactive surface and the Swift
// `PyreonAuth` one-for-one.
//
// ## What this delivers
//
// A reactive AUTH-STATE container (Compose `MutableState`, read `.value`),
// generic over the app's user type:
//
//     auth.status.value          // SIGNED_OUT / SIGNING_IN / SIGNED_IN / ERROR
//     auth.user.value            // the signed-in user, null when signed out
//     auth.error.value           // the last sign-in failure, null otherwise
//     auth.isAuthenticated       // convenience: status == SIGNED_IN
//
// A Composable gates on `auth.isAuthenticated` (app vs login screen) and
// recomposes when the auth state flips — the Compose analogue of a web
// `useAuth().isAuthenticated` read.
//
// ## Pure state machine — NO platform SDK edge
//
// Unlike the location / socket containers, `PyreonAuth` has **no injected
// platform edge**: auth STATE is pure reactive state, and the sign-in
// MECHANISM (OAuth/PKCE, a username/password POST via `PyreonHttp`, biometric
// unlock, token refresh) lives OUTSIDE and drives the transitions
// `beginSignIn` → `signInSucceeded(user)` | `signInFailed(error)` /
// `signOut`. So the whole container is synchronously unit-testable — there
// is NO Swift⇄Kotlin live-edge asymmetry here (both targets are pure state).
//
// Token persistence composes with `PyreonSecureStorage`; the token exchange
// composes with `PyreonHttp`. `PyreonAuth` owns only the reactive STATE.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const auth = useAuth<User>()` and emits a
// `PyreonAuth<User>`; `auth.isAuthenticated` / `auth.user` reads become reads
// on this container. Until that lands, this is usable by hand-written
// Compose code.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** The four auth states. Mirrors the Swift `PyreonAuthStatus`. */
public enum class PyreonAuthStatus {
    /** No user is signed in (initial, or after [PyreonAuth.signOut]). */
    SIGNED_OUT,

    /** A sign-in is in flight ([PyreonAuth.beginSignIn], not yet resolved). */
    SIGNING_IN,

    /** A user is signed in ([PyreonAuth.signInSucceeded]). */
    SIGNED_IN,

    /** The last sign-in failed ([PyreonAuth.signInFailed]). */
    ERROR,
}

/**
 * Reactive auth-state container — the Compose half of `useAuth`. Generic
 * over the app's [User] type. Exposes [status] / [user] / [error] as
 * Compose `MutableState` (read `.value`).
 */
public class PyreonAuth<User>(
    status: PyreonAuthStatus = PyreonAuthStatus.SIGNED_OUT,
    user: User? = null,
) {
    /** The current auth state. Read `.value` to drive routing. */
    public val status: MutableState<PyreonAuthStatus> = mutableStateOf(status)

    /** The signed-in user, or null when not signed in. */
    public val user: MutableState<User?> = mutableStateOf(user)

    /** The last sign-in failure, or null. Set by [signInFailed]; cleared by
     * [beginSignIn] / [signInSucceeded] / [signOut]. */
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    /** Convenience: true iff a user is signed in. Not Compose-reactive on
     * its own — reads `status.value`, so reading it in a Composable DOES
     * track `status` (the `.value` read registers). */
    public val isAuthenticated: Boolean get() = status.value == PyreonAuthStatus.SIGNED_IN

    /** True iff a sign-in is currently in flight. */
    public val isSigningIn: Boolean get() = status.value == PyreonAuthStatus.SIGNING_IN

    // MARK: - Transitions (the sign-in mechanism drives these)

    /** Enter the in-flight state: status = SIGNING_IN, prior error cleared.
     * Leaves any existing [user] in place (a refresh shouldn't blank the UI). */
    public fun beginSignIn() {
        error.value = null
        status.value = PyreonAuthStatus.SIGNING_IN
    }

    /** Complete sign-in: status = SIGNED_IN, set [user], clear [error]. */
    public fun signInSucceeded(user: User) {
        this.user.value = user
        this.error.value = null
        this.status.value = PyreonAuthStatus.SIGNED_IN
    }

    /** Fail sign-in: status = ERROR, set [error]. Leaves [user] as-is (a
     * failed REFRESH keeps the prior session; a failed initial sign-in has
     * user == null already). */
    public fun signInFailed(failure: Throwable) {
        this.error.value = failure
        this.status.value = PyreonAuthStatus.ERROR
    }

    /** Sign out: status = SIGNED_OUT, clear [user] + [error]. The caller
     * also clears the persisted token (PyreonSecureStorage.remove). */
    public fun signOut() {
        this.user.value = null
        this.error.value = null
        this.status.value = PyreonAuthStatus.SIGNED_OUT
    }
}
