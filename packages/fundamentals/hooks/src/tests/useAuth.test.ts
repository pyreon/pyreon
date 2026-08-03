// useAuth had no web half — the fourth hook in this arc with that gap, after
// useGeolocation, useDatabase, and useWebSocket.
//
// PMTC lowers `useAuth<User>()` to `PyreonAuth<User>` on BOTH native targets
// (device-proven including session rehydration, #2620), so the hook was fully
// real on iOS and Android and did not exist on web. Because PMTC matches hook
// NAMES and never resolves imports, the flagship finance real app's
// `import { useAuth } from '@pyreon/hooks'` compiled natively while being
// unresolvable in any web build — and the compiler's own
// `lowered-hooks-typecheck` fixture writes exactly that import.
//
// These tests assert the SHARED-CODE CONTRACT, not just that the hook works:
// the member names, the transition semantics, and the RENDERED status
// spellings have to match `PyreonAuth`, or one component body cannot read
// the same fields on three targets. The transition edge cases (`user`
// preserved through `beginSignIn` and `signInFailed`) mirror the Swift
// container line-for-line — each is a deliberate design decision there
// (a token refresh must not blank the UI), so drifting from them here would
// make the targets disagree in exactly the subtle way that class of parity
// break hides.

import { effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { useAuth } from '../useAuth'
import { useSecureStorage } from '../useSecureStorage'

interface User {
  id: string
  name: string
}

const ada: User = { id: '1', name: 'Ada' }

describe('useAuth — the web half of PyreonAuth', () => {
  it('starts signed out with no user and no error', () => {
    const auth = useAuth<User>()
    expect(auth.status).toBe('signedOut')
    expect(auth.user).toBeNull()
    expect(auth.error).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.isSigningIn).toBe(false)
  })

  it('renders the exact cross-target status spellings', () => {
    // The render contract: Swift camelCase enum rendering and Kotlin's
    // toString() override both produce these strings, so
    // `<Text>{auth.status}</Text>` must agree on web. SCREAMING_SNAKE here
    // would be the exact Kotlin parity break #2523's arc fixed, reintroduced
    // on a third target.
    const auth = useAuth<User>()
    expect(auth.status).toBe('signedOut')
    auth.beginSignIn()
    expect(auth.status).toBe('signingIn')
    auth.signInSucceeded(ada)
    expect(auth.status).toBe('signedIn')
    auth.signInFailed('boom')
    expect(auth.status).toBe('error')
    auth.signOut()
    expect(auth.status).toBe('signedOut')
  })

  it('signInSucceeded sets the user, clears error, flips isAuthenticated', () => {
    const auth = useAuth<User>()
    auth.signInFailed('previous failure')
    auth.signInSucceeded(ada)
    expect(auth.status).toBe('signedIn')
    expect(auth.user).toEqual(ada)
    expect(auth.error).toBeNull()
    expect(auth.isAuthenticated).toBe(true)
  })

  it('beginSignIn keeps the existing user — a token refresh must not blank the UI', () => {
    // Mirrors PyreonAuth.beginSignIn line-for-line: `status = .signingIn`,
    // error cleared, user LEFT IN PLACE.
    const auth = useAuth<User>()
    auth.signInSucceeded(ada)
    auth.beginSignIn()
    expect(auth.status).toBe('signingIn')
    expect(auth.isSigningIn).toBe(true)
    expect(auth.user).toEqual(ada)
    expect(auth.error).toBeNull()
  })

  it('signInFailed keeps the prior session visible — a failed refresh is not a sign-out', () => {
    const auth = useAuth<User>()
    auth.signInSucceeded(ada)
    auth.beginSignIn()
    auth.signInFailed('token refresh failed')
    expect(auth.status).toBe('error')
    expect(auth.error).toBe('token refresh failed')
    expect(auth.user).toEqual(ada) // NOT cleared
    expect(auth.isAuthenticated).toBe(false)
  })

  it('signOut clears user AND error', () => {
    const auth = useAuth<User>()
    auth.signInSucceeded(ada)
    auth.signInFailed('stale')
    auth.signOut()
    expect(auth.status).toBe('signedOut')
    expect(auth.user).toBeNull()
    expect(auth.error).toBeNull()
  })

  it('the members are LIVE reactive reads, not mount-time snapshots', () => {
    // The getters-over-signals contract. A component body runs ONCE, so a
    // plain-value return would freeze at `signedOut` forever — every static
    // assertion above would still pass, which is why this effect-based spec
    // is the load-bearing one (bisect: replacing the getters with captured
    // values fails exactly here).
    const auth = useAuth<User>()
    const seen: string[] = []
    const fx = effect(() => {
      seen.push(`${auth.status}:${auth.isAuthenticated}`)
    })
    auth.beginSignIn()
    auth.signInSucceeded(ada)
    auth.signOut()
    fx.dispose()
    expect(seen).toEqual([
      'signedOut:false',
      'signingIn:false',
      'signedIn:true',
      'signedOut:false',
    ])
  })

  it('each transition notifies ONCE — the multi-signal writes are batched', () => {
    // signInSucceeded writes user + error + status. Unbatched, an effect
    // reading two of them re-runs per write and a subscriber sees TORN
    // intermediate states (`user` set while `status` still 'signingIn') —
    // states the native @Observable container never exposes.
    const auth = useAuth<User>()
    const seen: string[] = []
    const fx = effect(() => {
      seen.push(`${auth.status}:${auth.user?.name ?? '-'}:${auth.error ?? '-'}`)
    })
    auth.signInSucceeded(ada)
    fx.dispose()
    expect(seen).toEqual(['signedOut:-:-', 'signedIn:Ada:-'])
  })

  it('composes with useSecureStorage for session rehydration — the #2620 pattern', () => {
    // The exact shape the finance app device-proves natively: persist on
    // sign-in, rehydrate on launch, and sign-out MUST clear the persisted
    // token or the next launch signs the user straight back in (#2620's
    // device bisect made that failure visible).
    const secrets = useSecureStorage()

    // Session 1: sign in, persist.
    const auth1 = useAuth<User>()
    auth1.signInSucceeded(ada)
    secrets.write('session', ada.id)

    // "Relaunch": a fresh container rehydrates from the persisted token.
    const auth2 = useAuth<User>()
    const token = secrets.read('session')
    if (token) auth2.signInSucceeded({ id: token, name: token })
    expect(auth2.isAuthenticated).toBe(true)

    // Sign out clears the persisted token — the inverse assertion.
    auth2.signOut()
    secrets.remove('session')
    const auth3 = useAuth<User>()
    const stale = secrets.read('session')
    if (stale) auth3.signInSucceeded({ id: stale, name: stale })
    expect(auth3.isAuthenticated).toBe(false)
  })
})
