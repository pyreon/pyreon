// PyreonSecureStorage — the Compose side of Pyreon's cross-platform SECRET
// persistence story (Tier 1). Mirrors a web `useSecureStorage` surface and
// the Swift `PyreonSecureStorage` one-for-one.
//
// ## What this delivers vs PyreonStorage
//
// `PyreonStorage` persists ordinary app state (DataStore-backed). Secrets —
// auth tokens, refresh tokens, API keys, PII — MUST live in the platform
// secret store (`EncryptedSharedPreferences` / the Android Keystore), which
// is hardware-backed and encrypted at rest. DataStore for a bearer token is
// a real security bug. Every finance / auth app needs this.
//
// `PyreonSecureStorage` is the imperative secret API:
//
//     val store = PyreonSecureStorage(backend)   // app wires the backend
//     store.write("ey…token", "auth")             // → encrypted store
//     val token = store.read("auth")              // String?
//     store.remove("auth")
//
// Imperative (read/write/remove), NOT a reactive view-state primitive — a
// secret is fetched at an auth boundary, not rendered as live UI.
//
// ## API design — mirrors @pyreon/native-runtime-swift
//
//   Swift                                       | Kotlin
//   --------------------------------------------+---------------------------
//   PyreonSecureBackend (protocol)              | PyreonSecureBackend (interface)
//   InMemorySecureBackend                       | InMemorySecureBackend
//   KeychainSecureBackend (real, default)       | (app-injected EncryptedSharedPreferences)
//   PyreonSecureStorage(backend: = Keychain)    | PyreonSecureStorage(backend)  ← REQUIRED
//   write / read / remove / contains            | write / read / remove / contains
//
// ## Implementation status — interface ships; real backend injected
//
// The SAME asymmetry `PyreonNetworkStatus` / `PyreonWebSocket` / `PyreonStorage`
// document:
//
// - **Swift** ships a real `KeychainSecureBackend` (the `Security` framework
//   is in the Swift toolchain) as the DEFAULT — secure out of the box.
// - **Kotlin** real secret storage needs `androidx.security:security-crypto`
//   (`EncryptedSharedPreferences`) + a `Context` — an Android-SDK dependency
//   the minimal `kotlinc`-against-Compose-stubs gate CAN'T provide. So the
//   facade REQUIRES an injected `PyreonSecureBackend` (NO default): the app
//   wires an `EncryptedSharedPreferencesBackend`, tests pass
//   `InMemorySecureBackend`. **There is deliberately no default** — a silent
//   in-memory fallback for a SECRET store would be a security footgun
//   (tokens silently lost on relaunch / never encrypted). An
//   `EncryptedSharedPreferences`-backed convenience is a Phase-2+ Android-CI
//   follow-up.
//
// The interface + in-memory backend is enough to unit-test the contract,
// validate the kotlinc surface, and back the `useSecureStorage` compiler
// emit (a follow-up — the PyreonFetch / PyreonNetworkStatus pattern).

package com.pyreon.runtime

/**
 * Pluggable secret backend. The facade REQUIRES one (no default — see the
 * file header on why a secret store must never silently fall back to
 * in-memory). The app wires an `EncryptedSharedPreferences`-backed
 * implementation; tests pass [InMemorySecureBackend]. Tiny + synchronous,
 * mirroring the Swift `PyreonSecureBackend` (secrets are small strings).
 */
public interface PyreonSecureBackend {
    /** Persist [value] at [key], overwriting any existing entry. Returns
     * true on success. */
    public fun write(value: String, key: String): Boolean

    /** Read the secret at [key], or null if absent / unreadable. */
    public fun read(key: String): String?

    /** Delete the secret at [key]. Returns true on success OR if the key
     * was already absent (idempotent delete). */
    public fun remove(key: String): Boolean
}

/**
 * In-memory backend — for tests + Compose previews. **NOT secure**: no
 * encryption, process-lifetime only, cleared on relaunch. Production code
 * injects an `EncryptedSharedPreferences`-backed [PyreonSecureBackend].
 */
public class InMemorySecureBackend : PyreonSecureBackend {
    private val store = mutableMapOf<String, String>()

    override fun write(value: String, key: String): Boolean {
        store[key] = value
        return true
    }

    override fun read(key: String): String? = store[key]

    override fun remove(key: String): Boolean {
        store.remove(key)
        return true // idempotent — absent key is still "removed"
    }
}

/**
 * Secret-storage facade — the Compose half of `useSecureStorage`. REQUIRES
 * an injected [backend] (no default — a SECRET store must never silently
 * fall back to non-persistent / non-encrypted memory).
 */
public class PyreonSecureStorage(private val backend: PyreonSecureBackend) {
    /** Persist [value] at [key] (overwrites). Returns true on success. */
    public fun write(value: String, key: String): Boolean = backend.write(value, key)

    /** Read the secret at [key], or null if absent / unreadable. */
    public fun read(key: String): String? = backend.read(key)

    /** Delete the secret at [key]. Idempotent — true even if already absent. */
    public fun remove(key: String): Boolean = backend.remove(key)

    /** True iff a secret exists at [key]. Convenience over `read != null`. */
    public fun contains(key: String): Boolean = backend.read(key) != null
}
