/**
 * The imperative secret store — `write`/`read`/`remove`/`contains`,
 * KEY-FIRST (`write(key, value)`), mirroring the native
 * `PyreonSecureStorage` facades one-for-one.
 *
 * Secrets — auth tokens, refresh tokens, API keys, PII — must NOT live in
 * ordinary app state or `useStorage` (localStorage is plaintext on disk and
 * readable by any same-origin script). This hook is the cross-platform
 * boundary for them:
 *
 * - **iOS** — PMTC lowers `useSecureStorage()` to `PyreonSecureStorage()`,
 *   Keychain-backed (hardware-backed, encrypted at rest, survives
 *   relaunch).
 * - **Android** — lowers to `PyreonSecureStorage(context)`, an
 *   AndroidKeyStore AES-GCM backend over app-private storage (encrypted at
 *   rest, survives relaunch).
 * - **Web** — a MODULE-SCOPED in-memory store. The web platform has no OS
 *   secret store, and persisting secrets to localStorage would be exactly
 *   the bug this hook exists to prevent — so web secrets are
 *   process-lifetime only (cleared on reload) and the store FAILS CLOSED.
 *   Persist a web session the platform way instead (httpOnly cookies /
 *   your auth provider); use this for in-memory token handling that
 *   should never touch disk.
 *
 * Imperative by design, NOT a reactive signal: a secret is fetched at an
 * auth boundary, not rendered as live UI. (Reactive app state belongs in
 * `useStorage`.)
 *
 * The store is app-wide (module-scoped), matching the Keychain/Keystore
 * semantics — two components calling `useSecureStorage()` see the same
 * secrets.
 *
 * @example
 * ```tsx
 * function AuthGate() {
 *   const secrets = useSecureStorage()
 *   const signIn = async () => {
 *     const token = await api.login()
 *     secrets.write('auth-token', token) // KEY first
 *   }
 *   const authedFetch = () =>
 *     fetch('/api/me', {
 *       headers: { Authorization: `Bearer ${secrets.read('auth-token') ?? ''}` },
 *     })
 *   const signOut = () => secrets.remove('auth-token')
 *   return <Button onPress={signIn}>Sign in</Button>
 * }
 * ```
 */

/** The imperative secret-store surface — identical on web, iOS (Keychain)
 * and Android (Keystore). All methods are synchronous (secrets are small
 * strings). */
import { isServer } from '@pyreon/reactivity'

export interface SecureStorage {
  /** Persist `value` at `key` (KEY FIRST — overwrites). Returns true on
   * success. */
  write(key: string, value: string): boolean
  /** Read the secret at `key`, or `null` if absent / unreadable. */
  read(key: string): string | null
  /** Delete the secret at `key`. Idempotent — true even if already
   * absent. */
  remove(key: string): boolean
  /** True iff a secret exists at `key`. Convenience over `read != null`. */
  contains(key: string): boolean
}

// Module-scoped: the secret store is app-wide, like the Keychain/Keystore
// it mirrors. Never serialized, never persisted — see the header.
//
// "App-wide" is the right scope for a BROWSER, where one process serves one
// user. It is the wrong scope for a SERVER, where one process serves everyone:
// a component that writes a secret during SSR would leave it in this map for
// every LATER request to read. See `serverSecureStorage` below.
const memoryStore = new Map<string, string>()

const webSecureStorage: SecureStorage = {
  write(key, value) {
    memoryStore.set(key, value)
    return true
  },
  read(key) {
    return memoryStore.get(key) ?? null
  },
  remove(key) {
    memoryStore.delete(key)
    return true // idempotent — absent key is still "removed"
  },
  contains(key) {
    return memoryStore.has(key)
  },
}

/**
 * The server arm: an inert store.
 *
 * There is no Keychain, no Keystore and no browser process on the server, so
 * there is nothing for this hook to mirror — and the module-scoped map the web
 * arm uses is shared by every request the process serves. A component that
 * wrote a session token during SSR would leave it there for the NEXT visitor to
 * read, which is a cross-request secret leak rather than a persistence quirk.
 *
 * Returning an empty store is the honest answer and it is also the consistent
 * one: every caller within a render sees the same (empty) result, and nothing
 * crosses a request boundary. `write` returns `false` because it did not store
 * anything — a caller that needs server-side secrets should read them from the
 * request context or the environment, not from a Keychain mirror.
 */
const serverSecureStorage: SecureStorage = {
  write: () => false,
  read: () => null,
  remove: () => true, // idempotent: nothing is stored, so it is already gone
  contains: () => false,
}

export function useSecureStorage(): SecureStorage {
  return isServer ? serverSecureStorage : webSecureStorage
}
