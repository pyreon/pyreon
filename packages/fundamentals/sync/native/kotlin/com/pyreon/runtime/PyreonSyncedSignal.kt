// PyreonSyncedSignal — the Android side of `@pyreon/sync`'s `syncedSignal`,
// one-for-one with PyreonSyncedSignal.swift so an iOS and an Android signal on
// the same CRDT `key` converge.
//
// Web:
//     const doc = createCrdtDoc()
//     val title = syncedSignal({ doc, key: 'title', initial: '' })
//     title()          // read
//     title.set("Hi")  // write — one CRDT op
//
// On Android the value lives in a Compose `mutableStateOf`, so a composable
// reading `title()` recomposes when the value changes — from a local `set(...)`
// OR a remote op applied to the doc (`doc.applyOps` → the map observer → this
// signal). Multiple synced signals over the SAME `doc` share state, as on web.
//
// Scope (v1): scalar values only — `String` / `Double` / `Boolean` (JS numbers
// are doubles). Create-if-missing matches web's local-first convention: an
// ABSENT key is seeded with `initial`; a PRESENT key wins. Cross-DEVICE
// transport (doc.onLocalOps ↔ a native WebSocket) is a tracked follow-up.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** The default map name, byte-identical to web's `DEFAULT_MAP`. */
const val PYREON_SYNCED_DEFAULT_MAP = "pyreon"

/** Encode a supported scalar to the CRDT's `PyreonScalar`. */
private fun anyToScalar(value: Any?): PyreonScalar = when (value) {
    is String -> PyreonScalar.Str(value)
    is Double -> PyreonScalar.Num(value)
    is Int -> PyreonScalar.Num(value.toDouble())
    is Boolean -> PyreonScalar.Bool(value)
    else -> throw IllegalArgumentException("PyreonSyncedSignal: unsupported value type $value")
}

/** Decode a `PyreonScalar` back to the caller's `T`, or null if the shape differs. */
@Suppress("UNCHECKED_CAST")
private fun <T> scalarToValue(scalar: PyreonScalar, sample: T): T? = when (sample) {
    is String -> (scalar as? PyreonScalar.Str)?.v as? T
    is Double -> (scalar as? PyreonScalar.Num)?.v as? T
    is Boolean -> (scalar as? PyreonScalar.Bool)?.v as? T
    else -> null
}

/**
 * A `Signal<T>`-shaped view over one scalar entry in a shared [PyreonCrdtDoc].
 * `T` is one of `String` / `Double` / `Boolean`.
 */
class PyreonSyncedSignal<T>(
    private val doc: PyreonCrdtDoc,
    private val key: String,
    initial: T,
    private val map: String = PYREON_SYNCED_DEFAULT_MAP,
) {
    private val _value: MutableState<T>
    private val unsubscribe: () -> Unit

    /** The current value. Compose reads track it; writes go through [set]. */
    val value: T get() = _value.value

    init {
        // Local-first create-if-missing: a PRESENT key wins over `initial`.
        val existing = doc.get(map, key)
        val start = if (existing != null) scalarToValue(existing, initial) ?: initial else initial
        _value = mutableStateOf(start)
        if (existing == null) doc.set(map, key, anyToScalar(initial))

        // A remote op (or another signal on this doc+key) updates `value`.
        unsubscribe = doc.observe(map) { changed ->
            if (changed.contains(key)) {
                val s = doc.get(map, key)
                if (s != null) {
                    val v = scalarToValue(s, initial)
                    if (v != null) _value.value = v
                }
            }
        }
    }

    /** `signal()` — read the current value (Kotlin `invoke` for the web spelling). */
    operator fun invoke(): T = _value.value

    /** `signal.set(v)` — write one CRDT op and update the local value. */
    fun set(v: T) {
        doc.set(map, key, anyToScalar(v))
        _value.value = v
    }

    /** Detach the CRDT observer. Idempotent. Mirrors web `dispose()`. */
    fun dispose() = unsubscribe()
}
