// PyreonStorage — Compose-aware persistent state for the Android side
// of Pyreon's cross-platform persistence story.
//
// ## What this delivers
//
// The PMTC compiler currently emits this 4-line saver-boilerplate for
// every `useStorage<T>('key', default)` source call:
//
// ```kotlin
// var todos by rememberSaveable(saver = Saver<List<Todo>, String>(
//     save = { Json.encodeToString(it) },
//     restore = { Json.decodeFromString<List<Todo>>(it) },
// )) { mutableStateOf<List<Todo>>(listOf()) }
// ```
//
// `rememberSaveable` survives configuration changes (rotation) but
// NOT app launches. For real cross-launch persistence, Android apps
// use SharedPreferences or DataStore.
//
// `rememberPyreonStorage` collapses BOTH concerns:
//
// ```kotlin
// var todos by rememberPyreonStorage("todos", listOf<Todo>())
// ```
//
// Behind the scenes: kotlinx-serialization JSON for the Codable
// round-trip, SharedPreferences-or-DataStore backing for actual
// cross-launch persistence, `MutableState<T>` projection so the
// Compose recomposition chain reacts to writes.
//
// ## API design — mirrors @pyreon/native-runtime-swift
//
// Both runtimes ship the same two-tier API:
//
//   Swift                                   | Kotlin
//   ----------------------------------------+-----------------------------------
//   @PyreonAppStorage("k") var x: T = d     | var x by rememberPyreonStorage("k", d)
//   PyreonStorage.read(T.self, key:)        | PyreonStorage.read(serializer, key)
//   PyreonStorage.write(_:key:)             | PyreonStorage.write(serializer, value, key)
//   PyreonStorage.remove(key:)              | PyreonStorage.remove(key)
//   PyreonStorage.decodeOrDefault(d,def:)   | PyreonStorage.decodeOrDefault(d, default)
//
// Failure semantics are identical: silent fallback to default on decode
// failure, silent drop on write failure. Apps needing visibility use
// the throwing escape hatches.
//
// ## Implementation status
//
// **Stub-backed for now.** The PyreonStorageBackend interface below is
// the abstraction over the storage layer; only `InMemoryBackend` ships
// here. The real `DataStoreBackend` implementation requires the Android
// SDK (Context + androidx.datastore.preferences) and CAN'T be built
// without it — `kotlinc` against the minimal Compose stubs in
// @pyreon/native-compiler only validates the API surface, not the
// real DataStore wiring. Documented as a Phase 2+ follow-up that
// needs Android CI infrastructure to verify end-to-end.
//
// The InMemoryBackend is enough to:
// - Unit-test the Codable round-trip via kotlinx-serialization
// - Validate the kotlinc surface
// - Provide a reasonable stub for Composable previews + isolated tests
//
// Real apps wire DataStoreBackend in their Application.onCreate or a
// Hilt module. The compiler emit can target either backend through
// the same rememberPyreonStorage entry point.

package com.pyreon.runtime

import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

/**
 * Pluggable storage backend. Concrete implementations:
 *
 * - [InMemoryBackend] — process-scope `MutableMap<String, String>` (this
 *   file). Useful for unit tests, Composable previews, and the kotlinc
 *   validation harness. Loses data on process exit.
 *
 * - DataStoreBackend (separate module, requires Android SDK) — wraps
 *   `androidx.datastore.preferences.preferencesDataStore` for actual
 *   cross-launch persistence. Not shipped here because the package
 *   intentionally has no Android-SDK dependency yet.
 *
 * Backends store values as JSON strings (kotlinx-serialization).
 * The serializer is supplied by the caller, so non-string T types
 * round-trip cleanly.
 */
public interface PyreonStorageBackend {
    public fun read(key: String): String?
    public fun write(key: String, value: String)
    public fun remove(key: String)
}

/**
 * Process-scope in-memory backend. Loses data on process exit, but
 * survives the application's lifetime — useful for unit tests, Composable
 * previews, and the kotlinc validation harness. Real apps wire
 * DataStoreBackend (separate module) for persistent storage.
 */
public class InMemoryBackend : PyreonStorageBackend {
    private val map: MutableMap<String, String> = mutableMapOf()

    override fun read(key: String): String? = map[key]
    override fun write(key: String, value: String) {
        map[key] = value
    }
    override fun remove(key: String) {
        map.remove(key)
    }
}

/**
 * Active backend. Apps configure this once at startup (typically in
 * `Application.onCreate` or a Hilt singleton). Default is
 * [InMemoryBackend] so unit tests + previews work without wiring.
 *
 * Real apps replace this with `DataStoreBackend(context)` for actual
 * cross-launch persistence.
 */
public object PyreonStorageRegistry {
    public var backend: PyreonStorageBackend = InMemoryBackend()
}

/**
 * Static utilities — non-Composable callers (unit tests, migrations,
 * snapshot-on-launch logic). Composable code should use
 * [rememberPyreonStorage] instead — it composes with the Compose
 * recomposition chain.
 */
public object PyreonStorage {
    /**
     * Decode a Codable value from a JSON string, falling back to the
     * default on decode failure or empty input. Same fallback path
     * `rememberPyreonStorage` uses internally.
     */
    public inline fun <reified T> decodeOrDefault(value: String?, default: T): T {
        if (value.isNullOrEmpty()) return default
        return try {
            Json.decodeFromString(serializer<T>(), value)
        } catch (_: Throwable) {
            default
        }
    }

    /**
     * Read a Codable value from the active backend, returning `null`
     * when the key is absent and THROWING on decode failure (for callers
     * that want explicit error handling vs the property wrapper's
     * silent fallback).
     */
    public inline fun <reified T> read(key: String): T? {
        val raw = PyreonStorageRegistry.backend.read(key) ?: return null
        if (raw.isEmpty()) return null
        return Json.decodeFromString(serializer<T>(), raw)
    }

    /** Write a Codable value to the active backend. Throws on encode failure. */
    public inline fun <reified T> write(key: String, value: T) {
        val encoded = Json.encodeToString(serializer<T>(), value)
        PyreonStorageRegistry.backend.write(key, encoded)
    }

    /** Remove a value at [key]. */
    public fun remove(key: String) {
        PyreonStorageRegistry.backend.remove(key)
    }
}

/**
 * Compose-aware persistent state. Returns a [MutableState] that:
 *
 * - **Reads** from the active [PyreonStorageBackend] on initial composition
 * - **Falls back** to [initial] when the key is absent or decode fails
 * - **Writes** back to the backend on every value assignment
 * - **Triggers recomposition** via the standard Compose `MutableState`
 *   observation chain
 *
 * Usage:
 *
 * ```kotlin
 * @Composable
 * fun TodoApp() {
 *     var todos by rememberPyreonStorage("todos", listOf<Todo>())
 *
 *     LazyColumn {
 *         items(todos, key = { it.id }) { todo ->
 *             Text(todo.text)
 *         }
 *     }
 * }
 * ```
 *
 * Identical API ergonomics to SwiftUI's `@PyreonAppStorage` on iOS.
 *
 * The `remember` wrapping (vs `rememberSaveable`) is intentional — the
 * backend already handles the persistence layer, so we don't need
 * Compose's saved-instance machinery on top. `rememberSaveable` would
 * double-up: backend persists across launches AND saveable persists
 * across rotation. Using bare `remember` keeps the state semantics
 * single-sourced.
 *
 * Failure semantics match web `@pyreon/storage` and Swift's
 * `@PyreonAppStorage`: silent fallback to default on decode failure,
 * silent drop on encode failure.
 */
@Composable
public inline fun <reified T> rememberPyreonStorage(
    key: String,
    initial: T,
): MutableState<T> {
    // Capture the FULLY-GENERIC serializer at the reified call site.
    // The write shim previously derived it from the value's ERASED
    // runtime class (`newValue!!::class.java` — a raw ArrayList for a
    // List<Todo>), which kotlinx-serialization rejects at runtime; the
    // silent-drop encode contract then swallowed the failure, so NO
    // generic-typed value was EVER written through to the backend.
    // Invisible to compile-time validation by construction — caught by
    // the FIRST device persistence assertion (M1.2a): pre-recreate
    // rendering worked from in-memory state, the post-recreate read
    // returned null.
    val ser = serializer<T>()
    val state = remember(key) {
        val current = PyreonStorageRegistry.backend.read(key)
        val initialValue: T = PyreonStorage.decodeOrDefault(current, initial)
        val s = mutableStateOf(initialValue)
        s
    }
    // Write-through observer: on every value change, encode + persist.
    // We don't use Compose's SnapshotStateObserver here because the
    // common case is a single subscriber (this state itself) and the
    // observer registration adds complexity without payoff. Instead we
    // wrap the MutableState in a delegating shim that intercepts writes.
    return PyreonStorageState(key, state, ser)
}

/**
 * Internal `MutableState` shim that delegates reads/writes to the
 * underlying state AND writes through to the active backend on every
 * change. Mirrors how a SwiftUI property wrapper's setter writes to
 * UserDefaults.
 */
@PublishedApi
internal class PyreonStorageState<T>(
    private val key: String,
    private val delegate: MutableState<T>,
    private val ser: KSerializer<T>,
) : MutableState<T> {
    override var value: T
        get() = delegate.value
        set(newValue) {
            delegate.value = newValue
            // Encode + write to backend. Encode failures are silently
            // dropped — same contract as the iOS @PyreonAppStorage setter.
            // We can't use the `inline` PyreonStorage.write because we
            // don't have a reified type at this site; do the encode
            // inline via the delegate's runtime type.
            try {
                // Uses the fully-generic KSerializer captured at the
                // reified rememberPyreonStorage call site — deriving one
                // here from the value's erased runtime class silently
                // failed for EVERY generic type (List<Todo> → raw
                // ArrayList → SerializationException → swallowed), so
                // writes never reached the backend (M1.2a device find).
                val encoded = Json.encodeToString(ser, newValue)
                PyreonStorageRegistry.backend.write(key, encoded)
            } catch (_: Throwable) {
                // Silent — matches contract.
            }
        }

    override fun component1(): T = value
    override fun component2(): (T) -> Unit = { value = it }
}
