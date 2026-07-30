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
//     val store = PyreonSecureStorage(context)   // Keystore-backed default
//     store.write("auth", "ey…token")             // → encrypted store (KEY first)
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
//   PyreonSecureStorage(backend: = Keychain)    | PyreonSecureStorage(context) → Keystore-backed
//                                               | (PyreonSecureStorageAndroid.kt factory)
//   write / read / remove / contains            | write / read / remove / contains
//
// ## Implementation status — REAL Keystore-backed default via Context
//
// Both platforms now ship a real, secure default:
//
// - **Swift**: `KeychainSecureBackend` (the `Security` framework) — the
//   0-arg constructor default.
// - **Kotlin**: `KeystoreSecureBackend(context)` (AndroidKeyStore AES-GCM
//   over app-private SharedPreferences — see PyreonSecureStorageAndroid.kt),
//   reached via the `PyreonSecureStorage(context)` factory the compiler
//   emit constructs (the PyreonDatabase(context) shape). No new gradle
//   dependency: the androidx `security-crypto` artifact is deprecated, and
//   Keystore + javax.crypto is the platform surface it wrapped anyway.
//
// The earlier "no default — app must inject a backend" stance guarded
// against a silent IN-MEMORY default (a security footgun: tokens silently
// lost on relaunch / never encrypted). A real ENCRYPTED default removes the
// footgun rather than the default — same resolution as FileStorageBackend /
// FileDatabaseBackend replacing their in-memory placeholders. The
// backend-injection constructor remains for apps that want their own store;
// tests still pass `InMemorySecureBackend`.
//
// ## Key-first API (BREAKING, pre-1.0)
//
// `write(key, value)` — key FIRST on every platform (web, Swift, Kotlin).
// The original `write(value, key)` order was a live hazard: PMTC emits
// member calls positionally, both parameters are String, so the natural TS
// call `sec.write('auth', token)` would have COMPILED with the arguments
// crossed and silently stored the token under the wrong key.

package com.pyreon.runtime

/**
 * Pluggable secret backend. The `PyreonSecureStorage(context)` factory
 * (PyreonSecureStorageAndroid.kt) wires the real [KeystoreSecureBackend];
 * tests pass [InMemorySecureBackend]. Tiny + synchronous, mirroring the
 * Swift `PyreonSecureBackend` (secrets are small strings).
 */
public interface PyreonSecureBackend {
    /** Persist [value] at [key] (KEY FIRST — the cross-platform contract;
     * see the header). Overwrites any existing entry. Returns true on
     * success. */
    public fun write(key: String, value: String): Boolean

    /** Read the secret at [key], or null if absent / unreadable. */
    public fun read(key: String): String?

    /** Delete the secret at [key]. Returns true on success OR if the key
     * was already absent (idempotent delete). */
    public fun remove(key: String): Boolean
}

/**
 * In-memory backend — for tests + Compose previews. **NOT secure**: no
 * encryption, process-lifetime only, cleared on relaunch. Production code
 * uses `PyreonSecureStorage(context)` (Keystore-backed).
 */
public class InMemorySecureBackend : PyreonSecureBackend {
    private val store = mutableMapOf<String, String>()

    override fun write(key: String, value: String): Boolean {
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
 * Secret-storage facade — the Compose half of `useSecureStorage`. Construct
 * via `PyreonSecureStorage(context)` (Keystore-backed default) or inject a
 * [backend]. There is deliberately no 0-arg constructor: a SECRET store must
 * never silently fall back to non-persistent / non-encrypted memory.
 */
public class PyreonSecureStorage(private val backend: PyreonSecureBackend) {
    /** Persist [value] at [key] (overwrites). Returns true on success. */
    public fun write(key: String, value: String): Boolean = backend.write(key, value)

    /** Read the secret at [key], or null if absent / unreadable. */
    public fun read(key: String): String? = backend.read(key)

    /** Delete the secret at [key]. Idempotent — true even if already absent. */
    public fun remove(key: String): Boolean = backend.remove(key)

    /** True iff a secret exists at [key]. Convenience over `read != null`. */
    public fun contains(key: String): Boolean = backend.read(key) != null
}
