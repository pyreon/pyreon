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
// are doubles).
//
// Create-if-missing seeds a SEPARATE defaults map (web #2519): `initial` is
// written into a companion `"<map>:defaults"` map, NEVER the real data map, and
// reads resolve real → defaults → `initial`. Reads PREFER the real map, so a
// default can never outrank real data no matter how an actor tie-break falls —
// closing the "two fresh devices open, one types, the other's default wipes it"
// clobber. Byte-for-byte the web design: same `:defaults` suffix, same precedence.
//
// Residual (inherent, same as web): two FRESH peers seeding an EMPTY room with
// DIFFERENT `initial` values still tie-break — but among DEFAULTS only, so peers
// CONVERGE on one default (harmless), they never diverge and a real value is never
// lost to it.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** The default map name, byte-identical to web's `DEFAULT_MAP`. */
const val PYREON_SYNCED_DEFAULT_MAP = "pyreon"

/**
 * Suffix for the companion map that holds create-if-missing DEFAULTS —
 * byte-identical to web's `DEFAULTS_SUFFIX`. Kept OUT of the data map so a default
 * can never win an actor tie-break against real data (#2519); reads prefer the
 * data map.
 */
const val PYREON_SYNCED_DEFAULTS_SUFFIX = ":defaults"

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
    private val initial: T,
    private val map: String = PYREON_SYNCED_DEFAULT_MAP,
) {
    /** The companion `"<map>:defaults"` map that holds create-if-missing seeds. */
    private val defaultsMap: String = "$map$PYREON_SYNCED_DEFAULTS_SUFFIX"
    private val _value: MutableState<T>
    private val unsubscribe: () -> Unit
    private val unsubscribeDefaults: () -> Unit

    /** The current value. Compose reads track it; writes go through [set]. */
    val value: T get() = _value.value

    /** Real value if present, else a shared default, else the local `initial`. */
    private fun resolve(): T {
        doc.get(map, key)?.let { scalarToValue(it, initial)?.let { v -> return v } }
        doc.get(defaultsMap, key)?.let { scalarToValue(it, initial)?.let { v -> return v } }
        return initial
    }

    init {
        _value = mutableStateOf(resolve())

        // Observe the REAL map: any real write (local `set` or a remote op) updates `value`.
        unsubscribe = doc.observe(map) { changed ->
            if (changed.contains(key)) _value.value = resolve()
        }

        // Observe the DEFAULTS map: a peer's default reaches a peer that has none, but
        // a real value already present WINS (real-map precedence) — skip when the real
        // map holds the key so a late default never overwrites real data.
        unsubscribeDefaults = doc.observe(defaultsMap) { changed ->
            if (changed.contains(key) && !doc.has(map, key)) _value.value = resolve()
        }

        // Create-if-missing SEED — into the DEFAULTS map, never the real map (#2519),
        // and only when the key is absent from BOTH.
        if (!doc.has(map, key) && !doc.has(defaultsMap, key)) {
            doc.set(defaultsMap, key, anyToScalar(initial))
        }
    }

    /** `signal()` — read the current value (Kotlin `invoke` for the web spelling). */
    operator fun invoke(): T = _value.value

    /**
     * `signal.set(v)` — a user write is REAL data, so it goes to the REAL map (never
     * the defaults map). Writes one CRDT op; the real-map observer echoes it back.
     */
    fun set(v: T) {
        doc.set(map, key, anyToScalar(v))
        _value.value = v
    }

    /** Detach both CRDT observers. Idempotent. Mirrors web `dispose()`. */
    fun dispose() {
        unsubscribe()
        unsubscribeDefaults()
    }
}
