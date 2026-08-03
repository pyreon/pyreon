// useAuth — the auth-state container, shared across web / iOS / Android.
//
// The native half already existed on both targets and is device-proven: PMTC
// lowers `useAuth<User>()` to `PyreonAuth<User>` (`@Observable` Swift /
// Compose-state Kotlin), and the finance real-app gate drives the sign-in
// flow AND session rehydration through it (#2520, #2620). The WEB half did
// not exist — no implementation, no export, no type anywhere outside
// `packages/native/`.
//
// That gap is the same one `useDatabase` / `useMap` / `useWebSocket` had, and
// it fails the same way: PMTC matches hook NAMES and never resolves imports,
// so `examples/native-finance/src/FinanceApp.tsx` — the flagship REAL app,
// device-gated on both platforms — writes `import { useAuth } from
// '@pyreon/hooks'`, which compiles for iOS and Android while being an
// unresolvable import on web. The compiler's own `lowered-hooks-typecheck`
// fixture writes exactly that import too.
//
// FIELD NAMES, TRANSITION SEMANTICS, AND RENDERED SPELLINGS MIRROR
// `PyreonAuth` EXACTLY, because one component body reads the same members on
// three targets:
//
//   status            .signedOut/.signingIn/.signedIn/.error
//                       -> 'signedOut' | 'signingIn' | 'signedIn' | 'error'
//   user              User?      -> User | null
//   error             Error?     -> string | null  (rendered, so a string —
//                       the compiler's SERVICE_OPTIONAL_FIELDS types
//                       `auth.error` as `string`; see #2620's fix notes)
//   isAuthenticated   Bool       -> boolean
//   isSigningIn       Bool       -> boolean
//   beginSignIn / signInSucceeded(user) / signInFailed(failure) / signOut
//
// The STATUS STRINGS are the cross-target render contract: Swift renders the
// enum cases camelCase, and Kotlin's `PyreonAuthStatus` carries an explicit
// `toString()` override to the same spellings (the SCREAMING_SNAKE default
// was one of the five parity breaks the real-app method surfaced), so
// `<Text>{auth.status}</Text>` shows `signedOut` on all three targets.
//
// PURE STATE MACHINE — no platform edge, mirroring the native design note:
// the sign-in MECHANISM (an OAuth redirect, a POST, a biometric unlock)
// lives outside the container and drives it through the explicit
// transitions. Token persistence composes with `useSecureStorage` (store on
// `signInSucceeded`, clear on `signOut` — the rehydration pattern the
// finance app device-proves), the exchange composes with `fetch`/HTTP.
// Because there is no I/O here, the hook is SSR-safe with no environment
// guard: it is signals all the way down.
//
// Getters over signals, not plain values: a component body runs ONCE, so
// returning `{ status: status() }` would freeze at the mount value. The
// getters re-read the signal at each access, which is how the native
// `@Observable` / `mutableStateOf` fields behave.
//
// TRANSITION DETAILS THAT ARE EASY TO GET WRONG (each mirrors the Swift
// container line-for-line, and each has a test):
//   - `beginSignIn` keeps `user` — a token REFRESH while signed in must not
//     blank the UI.
//   - `signInFailed` keeps `user` — a failed refresh keeps the prior session
//     visible; a failed initial sign-in has `user === null` already.
//   - `signInSucceeded` / `beginSignIn` / `signOut` all clear `error`.

import { batch, signal } from '@pyreon/reactivity'

/**
 * The four auth states, as their cross-target RENDERED spellings — Swift
 * camelCase enum rendering and Kotlin's `toString()` override produce these
 * exact strings.
 */
export type UseAuthStatus = 'signedOut' | 'signingIn' | 'signedIn' | 'error'

/**
 * Auth-state handle. Member names and transition semantics match the native
 * `PyreonAuth<User>` container so one source works on all three targets.
 */
export interface UseAuthResult<User> {
  /** Current auth state. Read to drive routing (app vs login screen). */
  readonly status: UseAuthStatus
  /** The signed-in user, or `null` when not signed in. */
  readonly user: User | null
  /**
   * The last sign-in failure, or `null`. A string because that is what every
   * target can RENDER — the native containers hold `Error?`/`Throwable?`,
   * and the shared-source type contract narrows to `string`.
   */
  readonly error: string | null
  /** Convenience: `status === 'signedIn'`. */
  readonly isAuthenticated: boolean
  /** True while a sign-in is in flight. */
  readonly isSigningIn: boolean
  /**
   * Enter the in-flight state. Clears `error`; keeps any existing `user`
   * (a token refresh while signed in shouldn't blank the UI).
   */
  beginSignIn(): void
  /** Complete sign-in: sets `user`, clears `error`, `status = 'signedIn'`. */
  signInSucceeded(user: User): void
  /**
   * Fail sign-in: sets `error`, `status = 'error'`. Keeps `user` as-is (a
   * failed REFRESH keeps the prior session visible).
   */
  signInFailed(failure: string): void
  /**
   * Sign out: clears `user` + `error`, `status = 'signedOut'`. The caller
   * also clears any persisted token (`useSecureStorage().remove`), exactly
   * as on native — #2620's device bisect shows what happens otherwise: the
   * next launch's rehydration read signs the "signed-out" user straight
   * back in.
   */
  signOut(): void
}

/**
 * Reactive auth-state container — the web half of the cross-platform
 * `useAuth` story. See the header for the exact native mirror contract.
 */
export function useAuth<User = unknown>(): UseAuthResult<User> {
  const status = signal<UseAuthStatus>('signedOut')
  const user = signal<User | null>(null)
  const error = signal<string | null>(null)

  return {
    get status() {
      return status()
    },
    get user() {
      return user()
    },
    get error() {
      return error()
    },
    get isAuthenticated() {
      return status() === 'signedIn'
    },
    get isSigningIn() {
      return status() === 'signingIn'
    },
    beginSignIn() {
      batch(() => {
        status.set('signingIn')
        error.set(null)
      })
    },
    signInSucceeded(nextUser: User) {
      batch(() => {
        user.set(nextUser)
        error.set(null)
        status.set('signedIn')
      })
    },
    signInFailed(failure: string) {
      batch(() => {
        error.set(failure)
        status.set('error')
      })
    },
    signOut() {
      batch(() => {
        user.set(null)
        error.set(null)
        status.set('signedOut')
      })
    },
  }
}
