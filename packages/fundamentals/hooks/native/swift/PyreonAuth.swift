// PyreonAuth — the SwiftUI side of Pyreon's cross-platform authentication
// story (Tier 1). Mirrors a web `useAuth` reactive surface and the Kotlin
// `PyreonAuth` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive AUTH-STATE container, generic over the app's
// user type:
//
//     auth.status          // .signedOut / .signingIn / .signedIn / .error
//     auth.user            // the signed-in user, nil when signed out
//     auth.error           // the last sign-in failure, nil otherwise
//     auth.isAuthenticated // convenience: status == .signedIn
//
// A SwiftUI view gates on `auth.isAuthenticated` (route to the app vs the
// login screen) and re-renders when the auth state flips — the native
// analogue of a web `useAuth().isAuthenticated` reactive read.
//
// ## Pure state machine — NO platform SDK edge
//
// Unlike the location / socket / keychain containers, `PyreonAuth` has **no
// live platform edge** to construct: the auth STATE is pure reactive state,
// and the actual sign-in MECHANISM (an OAuth/PKCE redirect, a username/
// password POST via `PyreonHttp`, a biometric unlock, a token refresh)
// lives OUTSIDE the container and drives it through the explicit transitions
// `beginSignIn` → `signInSucceeded(user)` | `signInFailed(error)` /
// `signOut`. So the whole container is synchronously unit-testable on BOTH
// targets — there is no "constructed, not asserted" device caveat here.
//
// Token persistence composes with `PyreonSecureStorage` (store the token on
// `signInSucceeded`, clear it on `signOut`); the token exchange composes
// with `PyreonHttp.send`. `PyreonAuth` owns only the reactive STATE those
// pieces drive.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const auth = useAuth<User>()` and emits a
// `PyreonAuth<User>` instance; `auth.isAuthenticated` / `auth.user` reads in
// the component body become reads on this container, and the app's sign-in
// action calls the transitions. Until that lands (the per-service-port
// follow-up), this is usable by hand-written SwiftUI code.

import Foundation
import Observation

/// The four auth states. Mirrors the Kotlin `PyreonAuthStatus`.
public enum PyreonAuthStatus: Sendable {
    /// No user is signed in (initial state, or after `signOut`).
    case signedOut
    /// A sign-in is in flight (`beginSignIn` called, not yet resolved).
    case signingIn
    /// A user is signed in (`signInSucceeded`).
    case signedIn
    /// The last sign-in failed (`signInFailed`).
    case error
}

/// Observable auth-state container — the SwiftUI half of `useAuth`.
/// Generic over the app's `User` type.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonAuth<User> {
    /// The current auth state. Read to drive routing (app vs login screen).
    public private(set) var status: PyreonAuthStatus
    /// The signed-in user, or `nil` when not signed in.
    public private(set) var user: User?
    /// The last sign-in failure, or `nil`. Set by `signInFailed`; cleared by
    /// `beginSignIn` / `signInSucceeded` / `signOut`.
    public private(set) var error: Error?

    /// Construct in a starting state. Defaults to `.signedOut`; pass
    /// `.signedIn` + a `user` when rehydrating a persisted session at launch
    /// (e.g. a valid token found in `PyreonSecureStorage`).
    public init(status: PyreonAuthStatus = .signedOut, user: User? = nil) {
        self.status = status
        self.user = user
    }

    /// Convenience: true iff a user is signed in.
    public var isAuthenticated: Bool { status == .signedIn }

    /// True iff a sign-in is currently in flight.
    public var isSigningIn: Bool { status == .signingIn }

    // MARK: - Transitions (the sign-in mechanism drives these)

    /// Enter the in-flight state: `status = .signingIn`, prior `error`
    /// cleared. Leaves any existing `user` in place (a token refresh while
    /// signed in shouldn't blank the UI).
    public func beginSignIn() {
        status = .signingIn
        error = nil
    }

    /// Complete sign-in: `status = .signedIn`, set `user`, clear `error`.
    public func signInSucceeded(_ user: User) {
        self.user = user
        self.error = nil
        self.status = .signedIn
    }

    /// Fail sign-in: `status = .error`, set `error`. Leaves `user` as-is
    /// (a failed REFRESH keeps the prior session visible; a failed initial
    /// sign-in has `user == nil` already).
    public func signInFailed(_ failure: Error) {
        self.error = failure
        self.status = .error
    }

    /// Sign out: `status = .signedOut`, clear `user` + `error`. The caller
    /// also clears the persisted token (`PyreonSecureStorage.remove`).
    public func signOut() {
        self.user = nil
        self.error = nil
        self.status = .signedOut
    }
}
