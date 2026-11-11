package com.pyreon.runtime

/**
 * JavaScript's `String(number)`, which a template literal performs on every
 * interpolated number.
 *
 * Kotlin prints a whole-valued `Double` with a trailing `.0` (`"${7.0}"` is
 * `"7.0"`), where the web prints `7`. The compiler routes every Double-typed
 * template interpoland through this, so a label, an axis tick or a counter
 * reads the same on every target.
 *
 * Whole values below 1e21 (where JavaScript switches to exponent notation)
 * print as integers, and the non-finite values use JavaScript's spelling. A
 * fractional value keeps Kotlin's shortest round-trip form, which agrees with
 * JavaScript's except in exponent notation (`1.0E-7` vs `1e-7`), a known
 * divergence. Integer types (`Int`, `Long` — `Math.round` returns a `Long`)
 * already print as JavaScript does.
 */
fun pyreonNumberString(value: Number): String {
    if (value !is Double && value !is Float) return value.toString()
    val v = value.toDouble()
    if (v.isNaN()) return "NaN"
    if (v == Double.POSITIVE_INFINITY) return "Infinity"
    if (v == Double.NEGATIVE_INFINITY) return "-Infinity"
    if (v == Math.floor(v) && Math.abs(v) < 1e21) {
        return if (Math.abs(v) < 9.0e15) v.toLong().toString() else java.math.BigDecimal(v).toBigInteger().toString()
    }
    return v.toString()
}

// ── Parsing text into numbers (ECMAScript `parseInt` / `parseFloat` / `Number`) ─────────────────────────────────
//
// Kotlin's `toLongOrNull()` / `toDoubleOrNull()` accept a WHOLE string in Kotlin's own grammar; the web's functions
// do not. `parseInt("3.5")` is 3 and `parseFloat("12px")` is 12 (both read the longest valid PREFIX), `Number("")` is
// 0 and `Number(" 12 ")` is 12, `Number("0x1f")` is 31. Each function below is that algorithm — the mirror of the
// Swift runtime's — so a value parsed from user input is the same number on every target.

/**
 * JavaScript's `Math.round`: the nearest integer, a tie rounding toward +Infinity (`-2.5` is `-2`), and NaN,
 * ±Infinity and every value already whole (|x| >= 2^52) returned unchanged. `java.lang.Math.round` returns a
 * `Long`, so it turned NaN into `0` and saturated at `Long.MAX_VALUE`: `Math.round(0 / 0) + 1` was `1` on Android
 * and NaN on iOS and the web. The iOS emit calls the same function.
 */
fun pyreonRound(x: Double): Double {
    if (!x.isFinite() || kotlin.math.abs(x) >= 4_503_599_627_370_496.0) return x
    val f = kotlin.math.floor(x)
    val r = if (x - f >= 0.5) f + 1.0 else f
    // `Math.round(-0.4)` is -0, as on the web.
    return if (r == 0.0 && x < 0) -0.0 else r
}

private fun pyreonIsJsSpace(c: Char): Boolean = c.isWhitespace() || c == '﻿'

private fun pyreonDigit(c: Char, radix: Int): Int? {
    val v = when (c) {
        in '0'..'9' -> c - '0'
        in 'a'..'z' -> c - 'a' + 10
        in 'A'..'Z' -> c - 'A' + 10
        else -> return null
    }
    return if (v < radix) v else null
}

/** JavaScript's `parseInt(text, radix)`. `null` where the web returns `NaN`; past `Long`'s range it clamps. */
fun pyreonParseInt(text: String, radix: Int? = null): Long? {
    var i = 0
    while (i < text.length && pyreonIsJsSpace(text[i])) i++
    var negative = false
    if (i < text.length && (text[i] == '+' || text[i] == '-')) {
        negative = text[i] == '-'
        i++
    }
    var r = radix ?: 0
    var stripPrefix = true
    if (r != 0) {
        if (r < 2 || r > 36) return null
        if (r != 16) stripPrefix = false
    } else {
        r = 10
    }
    if (stripPrefix && i + 1 < text.length && text[i] == '0' && (text[i + 1] == 'x' || text[i + 1] == 'X')) {
        i += 2
        r = 16
    }
    var value = 0L
    var any = false
    var overflow = false
    while (i < text.length) {
        val d = pyreonDigit(text[i], r) ?: break
        any = true
        if (!overflow) {
            val next = value * r + d
            if (value > (Long.MAX_VALUE - d) / r) overflow = true else value = next
        }
        i++
    }
    if (!any) return null
    if (overflow) return if (negative) Long.MIN_VALUE else Long.MAX_VALUE
    return if (negative) -value else value
}

/** The longest ECMAScript StrDecimalLiteral prefix of `s` from `from`, or `null`; `whole` demands all of `s`. */
private fun pyreonDecimalPrefix(s: String, from: Int, whole: Boolean): Double? {
    var i = from
    var sign = 1.0
    if (i < s.length && (s[i] == '+' || s[i] == '-')) {
        if (s[i] == '-') sign = -1.0
        i++
    }
    if (s.startsWith("Infinity", i)) {
        if (whole && i + 8 != s.length) return null
        return sign * Double.POSITIVE_INFINITY
    }
    val start = i
    var intDigits = 0
    while (i < s.length && s[i] in '0'..'9') { i++; intDigits++ }
    var fracDigits = 0
    if (i < s.length && s[i] == '.') {
        var j = i + 1
        while (j < s.length && s[j] in '0'..'9') { j++; fracDigits++ }
        if (intDigits > 0 || fracDigits > 0) i = j
    }
    if (intDigits == 0 && fracDigits == 0) return null
    var end = i
    if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
        var j = i + 1
        if (j < s.length && (s[j] == '+' || s[j] == '-')) j++
        var expDigits = 0
        while (j < s.length && s[j] in '0'..'9') { j++; expDigits++ }
        if (expDigits > 0) end = j
    }
    if (whole && end != s.length) return null
    return s.substring(start, end).toDoubleOrNull()?.let { sign * it }
}

/** JavaScript's `parseFloat(text)`: the longest decimal prefix after leading whitespace, `NaN` when there is none. */
fun pyreonParseFloat(text: String): Double {
    var i = 0
    while (i < text.length && pyreonIsJsSpace(text[i])) i++
    return pyreonDecimalPrefix(text, i, whole = false) ?: Double.NaN
}

/** JavaScript's `Number(text)` for a string: trimmed, `""` is 0, `0x`/`0o`/`0b` integers, else a whole decimal literal. */
fun pyreonToNumber(text: String): Double {
    val s = text.trim { pyreonIsJsSpace(it) }
    if (s.isEmpty()) return 0.0
    if (s.length > 2 && s[0] == '0') {
        val radix = when (s[1]) {
            'x', 'X' -> 16
            'o', 'O' -> 8
            'b', 'B' -> 2
            else -> 0
        }
        if (radix != 0) {
            var v = 0.0
            for (c in s.substring(2)) {
                val d = pyreonDigit(c, radix) ?: return Double.NaN
                v = v * radix + d
            }
            return v
        }
    }
    return pyreonDecimalPrefix(s, 0, whole = true) ?: Double.NaN
}
