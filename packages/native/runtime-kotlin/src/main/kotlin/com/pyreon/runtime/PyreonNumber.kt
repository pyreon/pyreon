package com.pyreon.runtime

/**
 * JavaScript's `String(number)` — ECMAScript `Number::toString`, which a template literal, a `String(x)` call and a
 * `"text" + x` concatenation all perform.
 *
 * Kotlin prints a whole-valued `Double` with a trailing `.0` (`"${7.0}"` is `"7.0"`) and uses its own exponent form
 * (`1.0E-7`, `1.0E15`), where the web prints `7`, `1e-7` and `1000000000000000`. This is the whole algorithm: the
 * SHORTEST digits that round-trip, laid out by the ECMAScript rules — positional for a decimal exponent in
 * (-7, 21], `1.5e-7` / `1e+21` beyond — with `NaN` / `Infinity` / `-Infinity` spelled as JavaScript spells them and
 * `-0` printed `0`. Integer types (`Int`, `Long` — `Math.round` returns a `Long`) already print as JavaScript does.
 * `PyreonJson.jsNumber` is the same algorithm for `JSON.stringify` (kept in its own file so each compiles alone);
 * `native-number-format-parity.test.ts` holds both to the web over one corpus.
 *
 * The digits are searched with BigDecimal rather than read off `Double.toString`: the JVM's `toString` was not
 * guaranteed shortest before JDK 19, and Android's libcore is its own implementation, so its digits cannot be
 * trusted to agree with V8's on every value. A whole value below 2^53 (every counter, index and id) skips the search.
 */
fun pyreonNumberString(value: Number): String {
    if (value !is Double && value !is Float) return value.toString()
    val v = value.toDouble()
    if (v.isNaN()) return "NaN"
    if (v == Double.POSITIVE_INFINITY) return "Infinity"
    if (v == Double.NEGATIVE_INFINITY) return "-Infinity"
    if (v == 0.0) return "0"
    if (v == Math.floor(v) && Math.abs(v) < 9.0e15) return v.toLong().toString()
    val abs = Math.abs(v)
    val exact = java.math.BigDecimal(abs)
    var best: java.math.BigDecimal = exact
    search@ for (p in 1..17) {
        var chosen: java.math.BigDecimal? = null
        for (mode in arrayOf(java.math.RoundingMode.HALF_EVEN, java.math.RoundingMode.FLOOR, java.math.RoundingMode.CEILING)) {
            val c = exact.round(java.math.MathContext(p, mode))
            if (c.toDouble() != abs) continue
            val cur = chosen
            if (cur == null || c.subtract(exact).abs() < cur.subtract(exact).abs()) chosen = c
        }
        if (chosen != null) {
            best = chosen
            break@search
        }
    }
    val unscaled = best.unscaledValue().toString()
    val point = unscaled.length - best.scale()
    val digits = unscaled.trimEnd('0').ifEmpty { "0" }
    return (if (v < 0) "-" else "") + pyreonNumberLayout(digits, point)
}

/** ECMAScript `Number::toString` layout for the digits `s` (k of them) with the decimal point at `n`. */
internal fun pyreonNumberLayout(s: String, n: Int): String {
    val k = s.length
    if (k <= n && n <= 21) return s + "0".repeat(n - k)
    if (0 < n && n <= 21) return s.substring(0, n) + "." + s.substring(n)
    if (-6 < n && n <= 0) return "0." + "0".repeat(-n) + s
    val e = n - 1
    val tail = if (k == 1) "" else "." + s.substring(1)
    return s.substring(0, 1) + tail + "e" + (if (e < 0) "-" else "+") + Math.abs(e)
}

/**
 * JavaScript's `Number.prototype.toFixed(digits)`.
 *
 * `"%.2f".format(x)` is not it: `java.util.Formatter` rounds the SHORTEST decimal form half-up, so
 * `(1.005).toFixed(2)` became `"1.01"` where the web says `"1.00"` (1.005 is 1.00499999… in binary), and
 * `(1.45).toFixed(1)` became `"1.5"` where the web says `"1.4"`. This rounds the double's EXACT value
 * (`BigDecimal(Double)` is exact) half up, as the specification does, so a tie such as `(2.5).toFixed(0)` is `"3"`
 * and everything else lands on the web's digits. A negative value keeps its sign even when it rounds to zero
 * (`(-0.0001).toFixed(2)` is `"-0.00"`), a value at or past 1e21 prints as `String(x)`, and `digits` is clamped to
 * toFixed's 0…100. Locale-invariant by construction (no `Locale.getDefault()` decimal comma).
 */
fun pyreonToFixed(value: Number, digits: Number): String {
    val x = value.toDouble()
    if (!x.isFinite() || Math.abs(x) >= 1e21) return pyreonNumberString(x)
    val f = digits.toInt().coerceIn(0, 100)
    val body = java.math.BigDecimal(Math.abs(x)).setScale(f, java.math.RoundingMode.HALF_UP).toPlainString()
    return (if (x < 0) "-" else "") + body
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
