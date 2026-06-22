// Smoke tests for PyreonSecureStorage — the imperative secret store.
// Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonSecureStorage`.
//
// Scope: the facade contract over the in-memory backend (write/read/remove/
// contains round-trip + idempotent delete). The real
// EncryptedSharedPreferences backend is the app's / Android-CI's
// responsibility — not exercised here, matching the injected-backend
// boundary the other runtime services use.

package com.pyreon.runtime

fun testSecureWriteReadRoundTrip() {
    val store = PyreonSecureStorage(InMemorySecureBackend())
    check(store.read("auth") == null) { "absent key reads null" }
    check(!store.contains("auth")) { "absent key: contains false" }
    check(store.write("ey.token", "auth")) { "write returns true" }
    check(store.read("auth") == "ey.token") { "read returns the written secret" }
    check(store.contains("auth")) { "present key: contains true" }
}

fun testSecureOverwrite() {
    val store = PyreonSecureStorage(InMemorySecureBackend())
    store.write("first", "k")
    store.write("second", "k")
    check(store.read("k") == "second") { "write overwrites" }
}

fun testSecureRemove() {
    val store = PyreonSecureStorage(InMemorySecureBackend())
    store.write("secret", "k")
    check(store.contains("k")) { "present before remove" }
    check(store.remove("k")) { "remove returns true" }
    check(store.read("k") == null) { "removed key reads null" }
    check(!store.contains("k")) { "removed key: contains false" }
}

fun testSecureRemoveAbsentIsIdempotent() {
    val store = PyreonSecureStorage(InMemorySecureBackend())
    check(store.remove("never-written")) { "remove of absent key is idempotent (true)" }
    check(store.read("never-written") == null) { "still absent" }
}

fun testSecureMultipleKeysIsolated() {
    val store = PyreonSecureStorage(InMemorySecureBackend())
    store.write("a-val", "a")
    store.write("b-val", "b")
    check(store.read("a") == "a-val") { "key a isolated" }
    check(store.read("b") == "b-val") { "key b isolated" }
    store.remove("a")
    check(store.read("a") == null) { "removing a leaves b" }
    check(store.read("b") == "b-val") { "b survives a's removal" }
}

/**
 * The facade is backend-agnostic — a custom [PyreonSecureBackend] (here a
 * call-counting spy) is honored. Pins the pluggable-backend contract: every
 * facade method routes through the injected backend (so an app wiring
 * EncryptedSharedPreferences gets exactly these calls).
 */
fun testSecureFacadeRoutesThroughBackend() {
    var writes = 0
    var reads = 0
    var removes = 0
    val spy = object : PyreonSecureBackend {
        private val inner = InMemorySecureBackend()
        override fun write(value: String, key: String): Boolean {
            writes++; return inner.write(value, key)
        }
        override fun read(key: String): String? {
            reads++; return inner.read(key)
        }
        override fun remove(key: String): Boolean {
            removes++; return inner.remove(key)
        }
    }
    val store = PyreonSecureStorage(spy)
    store.write("v", "k")
    store.read("k")
    store.contains("k") // contains also routes through read
    store.remove("k")
    check(writes == 1) { "write routed once" }
    check(reads == 2) { "read + contains both route through backend.read" }
    check(removes == 1) { "remove routed once" }
}

fun main() {
    testSecureWriteReadRoundTrip()
    testSecureOverwrite()
    testSecureRemove()
    testSecureRemoveAbsentIsIdempotent()
    testSecureMultipleKeysIsolated()
    testSecureFacadeRoutesThroughBackend()
    println("[PyreonSecureStorageTest] all smoke tests passed")
}
