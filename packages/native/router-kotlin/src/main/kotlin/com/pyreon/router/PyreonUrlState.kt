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

/**
 * JS `String(v)` for a number: a whole Double prints WITHOUT a trailing `.0`
 * (Kotlin's own `toString()` gives "1.0"). Fractional values and exponent forms
 * (below 1e-6, from 1e21) still use the target's own spelling. Shared by the scalar Double binding
 * and the number-list bindings so one value serializes one way everywhere.
 */
private fun pyreonUrlFormatDouble(value: Double): String =
    // A whole number prints as plain digits below 1e21 (JS switches to exponent form there); BigDecimal is exact for them.
    if (value == Math.floor(value) && Math.abs(value) < 1e21) java.math.BigDecimal(value).toPlainString() else value.toString()

// ── list codec ──────────────────────────────────────────────────────────────
//
// The web's comma format (`inferSerializer`, url-state/src/serializers.ts): the
// elements join with `,`, and an element that itself holds `,` or `%` is
// escaped (`%` -> `%25` FIRST so the escape stays reversible, then `,` -> `%2C`).
// Decoding touches only those two sequences, so a pre-existing `?tags=50%` still
// reads `50%`; `%2c` is accepted case-insensitively, `%25` only as written.

private fun pyreonUrlEscapeElement(s: String): String =
    if (s.contains('%') || s.contains(',')) s.replace("%", "%25").replace(",", "%2C") else s

private fun pyreonUrlUnescapeElement(s: String): String =
    if (s.contains('%')) s.replace("%2C", ",", ignoreCase = true).replace("%25", "%") else s

/** `""` is the EMPTY list (not one empty element); otherwise every comma splits, empties included. */
private fun pyreonUrlSplitList(raw: String): List<String> =
    if (raw.isEmpty()) emptyList() else raw.split(",").map { pyreonUrlUnescapeElement(it) }

private fun pyreonUrlJoinList(parts: List<String>): String =
    parts.joinToString(",") { pyreonUrlEscapeElement(it) }

/**
 * One bad element makes the WHOLE list fall back to the default (the web's
 * `INVALID` rule): a URL is untrusted, so a wrong-typed element must not reach
 * app state. NaN is the "invalid" sentinel, which `pyreonUrlNumber` already
 * returns for every spelling JS reads as NaN, and for blank text.
 */
private fun pyreonUrlListNumbers(raw: String): List<Double>? {
    val out = ArrayList<Double>()
    for (part in pyreonUrlSplitList(raw)) {
        val n = pyreonUrlNumber(part, Double.NaN)
        if (n.isNaN()) return null
        out.add(n)
    }
    return out
}

/** Long-valued search parameter. See `pyreonUrlNumber` for the decode. */
class PyreonUrlStateInt(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: Long,
) {
    operator fun invoke(): Long {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        val n = pyreonUrlNumber(raw, defaultValue.toDouble())
        // An integer-defaulted binding is a 64-bit integer on both targets, so
        // a fractional value has no representation — fall back to the
        // default, the same answer the web gives for a value it cannot read.
        // Bounded to the JS safe-integer range, identically to the Swift twin.
        if (n != Math.floor(n) || n < -9007199254740991.0 || n > 9007199254740991.0) return defaultValue
        return n.toLong()
    }
    fun set(value: Long) { router?.setQueryParam(key, value.toString()) }
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
    fun set(value: Double) { router?.setQueryParam(key, pyreonUrlFormatDouble(value)) }
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

/**
 * String-list search parameter (`useUrlState('tags', ['a'])`, or an empty
 * default, which carries no element type so stays strings, as on the web).
 */
class PyreonUrlStateStrings(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: List<String>,
) {
    operator fun invoke(): List<String> {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        return pyreonUrlSplitList(raw)
    }
    fun set(value: List<String>) { router?.setQueryParam(key, pyreonUrlJoinList(value)) }
    fun clear() { router?.setQueryParam(key, null) }
}

/**
 * Long-list search parameter. An element must be a whole number inside the JS
 * safe-integer range, exactly like the scalar Long binding; anything else makes
 * the whole list fall back to the default.
 */
class PyreonUrlStateInts(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: List<Long>,
) {
    operator fun invoke(): List<Long> {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        val nums = pyreonUrlListNumbers(raw) ?: return defaultValue
        val out = ArrayList<Long>()
        for (n in nums) {
            if (n != Math.floor(n) || n < -9007199254740991.0 || n > 9007199254740991.0) return defaultValue
            out.add(n.toLong())
        }
        return out
    }
    fun set(value: List<Long>) { router?.setQueryParam(key, pyreonUrlJoinList(value.map { it.toString() })) }
    fun clear() { router?.setQueryParam(key, null) }
}

/** Double-list search parameter. */
class PyreonUrlStateDoubles(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: List<Double>,
) {
    operator fun invoke(): List<Double> {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        return pyreonUrlListNumbers(raw) ?: defaultValue
    }
    fun set(value: List<Double>) { router?.setQueryParam(key, pyreonUrlJoinList(value.map { pyreonUrlFormatDouble(it) })) }
    fun clear() { router?.setQueryParam(key, null) }
}

/**
 * Bool-list search parameter. Each element decodes like the scalar Bool
 * (true/1, false/0); any other element makes the whole list the default.
 */
class PyreonUrlStateBools(
    private val router: PyreonRouter?,
    private val key: String,
    private val defaultValue: List<Boolean>,
) {
    operator fun invoke(): List<Boolean> {
        val raw = router?.query?.value?.get(key) ?: return defaultValue
        val out = ArrayList<Boolean>()
        for (part in pyreonUrlSplitList(raw)) {
            when (part) {
                "true", "1" -> out.add(true)
                "false", "0" -> out.add(false)
                else -> return defaultValue
            }
        }
        return out
    }
    fun set(value: List<Boolean>) { router?.setQueryParam(key, pyreonUrlJoinList(value.map { if (it) "true" else "false" })) }
    fun clear() { router?.setQueryParam(key, null) }
}
