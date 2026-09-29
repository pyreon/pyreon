// PyreonUrlState — the native half of `@pyreon/url-state`'s `useUrlState`.
// Kotlin mirror of router-swift's PyreonUrlState.swift.
//
// Compiler emit:
//   const page = useUrlState('page', 1)
//   ↓
//   PyreonUrlStateInt(LocalPyreonRouter.current, "page", 1)
//
// One class per default type (String / Int / Double / Boolean), each binding
// ONE search parameter of the active router. `operator fun invoke()` is the
// Kotlin spelling of Swift's `callAsFunction`, so `page()` reads and
// `page.set(v)` writes on BOTH targets and shared source does not fork.
//
// These used to be emitted INLINE into every generated file that called
// `useUrlState`. Each file compiled on its own; two such files in one Gradle
// source set — one Kotlin package — failed with `Redeclaration`. They need the
// router, so this package — which IS the router — is where they belong.
//
// The validation stubs carry a byte-for-byte copy
// (`@pyreon/native-compiler` kotlin-stubs.ts); `runtime-stub-parity.test.ts`
// fails the moment the two disagree.

package com.pyreon.router

// MARK: stub-mirror

class PyreonUrlState(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: String,
) {
    operator fun invoke(): String = router?.query?.value?.get(key) ?: defaultValue
    fun set(value: String) { router?.setQueryParam(key, value) }
    fun clear() { router?.setQueryParam(key, null) }
}

/**
 * JS `ToNumber(String)` — the Kotlin twin of router-swift's `pyreonUrlNumber`.
 * Same grammar, same order of checks, so both targets decode a pasted URL
 * identically; see the Swift source for the divergence table that motivates
 * it. Unparseable → the declared default, which is what the web does for NaN.
 */
private fun pyreonUrlNumber(raw: String, fallback: Double): Double {
    val t = raw.trim()
    if (t.isEmpty()) return fallback
    if (t == "Infinity" || t == "+Infinity") return Double.POSITIVE_INFINITY
    if (t == "-Infinity") return Double.NEGATIVE_INFINITY
    if (t.length > 2 && t[0] == '0') {
        val radix = when (t[1]) {
            'x', 'X' -> 16
            'o', 'O' -> 8
            'b', 'B' -> 2
            else -> 0
        }
        if (radix != 0) {
            val v = t.substring(2).toLongOrNull(radix) ?: return fallback
            return v.toDouble()
        }
    }
    // Only the decimal grammar's own characters. Rejects "inf"/"NaN"/"1_0" and
    // Kotlin's own "1.5f"/"1.5d" suffix forms, all of which JS reads as NaN.
    for (ch in t) {
        if (!(ch in '0'..'9' || ch == '+' || ch == '-' || ch == '.' || ch == 'e' || ch == 'E')) return fallback
    }
    val v = t.toDoubleOrNull() ?: return fallback
    return if (v.isNaN()) fallback else v
}

/** Int-valued search parameter. See `pyreonUrlNumber` for the decode. */
class PyreonUrlStateInt(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: Int,
) {
    operator fun invoke(): Int {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        val n = pyreonUrlNumber(raw, defaultValue.toDouble())
        // An integer-defaulted binding is Int on both targets, so a fractional
        // or out-of-range value has no representation — fall back to the
        // default, the same answer the web gives for a value it cannot read.
        if (n != Math.floor(n) || n < Int.MIN_VALUE.toDouble() || n > Int.MAX_VALUE.toDouble()) return defaultValue
        return n.toInt()
    }
    fun set(value: Int) { router?.setQueryParam(key, value.toString()) }
    fun clear() { router?.setQueryParam(key, null) }
}

/**
 * Double-valued search parameter. `set` mirrors JS `String(v)`, which prints a
 * whole Double WITHOUT a trailing `.0` — Kotlin's own `toString()` gives
 * "1.0", so the round-trip would not match the web's `?zoom=1`.
 */
class PyreonUrlStateDouble(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: Double,
) {
    operator fun invoke(): Double {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        return pyreonUrlNumber(raw, defaultValue)
    }
    fun set(value: Double) {
        val s = if (value == Math.floor(value) && Math.abs(value) < 1e15) value.toLong().toString() else value.toString()
        router?.setQueryParam(key, s)
    }
    fun clear() { router?.setQueryParam(key, null) }
}

/**
 * Bool-valued search parameter. Mirrors the web decode: true/1 → true,
 * false/0 → false, anything else → the DEFAULT (not `false`).
 */
class PyreonUrlStateBool(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: Boolean,
) {
    operator fun invoke(): Boolean {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        return when (raw) {
            "true", "1" -> true
            "false", "0" -> false
            else -> defaultValue
        }
    }
    fun set(value: Boolean) { router?.setQueryParam(key, if (value) "true" else "false") }
    fun clear() { router?.setQueryParam(key, null) }
}
