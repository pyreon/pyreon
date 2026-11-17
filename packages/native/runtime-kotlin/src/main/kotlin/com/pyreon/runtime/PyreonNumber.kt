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

// ─── Integer arithmetic with JavaScript's results ─────────────────────────────────────────────────────────────────
//
// The same model and functions as `PyreonNumber.swift` (read its comment): a TS integer is a 64-bit `Long`; `+ - *`
// and negation give the web's result (exact within ±2^53, the web's double beyond, saturated past ±2^63 — Kotlin's
// own operators WRAPPED there, so `2^62 * 4` was 0); `%` never throws (a zero divisor is 0, NaN's integer value);
// the bitwise operators are 32-bit (`ToInt32`, `>>>` with `ToUint32`, shift counts modulo 32).

private const val PYREON_SAFE_INTEGER = 9_007_199_254_740_992L

@Volatile private var pyreonIntegerNoticeShown = false

private fun pyreonIntegerResult(d: Double, op: String): Long {
    if ((d.isNaN() || Math.abs(d) >= 9.223372036854775807E18) && !pyreonIntegerNoticeShown) {
        pyreonIntegerNoticeShown = true
        System.err.println("[Pyreon] integer $op gave ${pyreonNumberString(d)} on the web, which a 64-bit integer cannot hold; stored as ${d.toLong()}. Use a fractional number (`1.0`) where values can grow past 2^63.")
    }
    return d.toLong()
}

fun pyreonAdd(a: Long, b: Long): Long {
    val r = a + b
    if (((a xor r) and (b xor r)) >= 0 && r >= -PYREON_SAFE_INTEGER && r <= PYREON_SAFE_INTEGER) return r
    return pyreonIntegerResult(a.toDouble() + b.toDouble(), "+")
}

fun pyreonSub(a: Long, b: Long): Long {
    val r = a - b
    if (((a xor b) and (a xor r)) >= 0 && r >= -PYREON_SAFE_INTEGER && r <= PYREON_SAFE_INTEGER) return r
    return pyreonIntegerResult(a.toDouble() - b.toDouble(), "-")
}

fun pyreonMul(a: Long, b: Long): Long {
    val r = a * b
    // `Math.multiplyHigh` is JDK 9 / Android API 31; the division check works everywhere.
    val overflow = a != 0L && (r / a != b || (a == -1L && b == Long.MIN_VALUE))
    if (!overflow && r >= -PYREON_SAFE_INTEGER && r <= PYREON_SAFE_INTEGER) return r
    return pyreonIntegerResult(a.toDouble() * b.toDouble(), "*")
}

fun pyreonNeg(a: Long): Long = if (a == Long.MIN_VALUE) Long.MAX_VALUE else -a

// The emit picks these by the INFERRED type. Where inference says integer but the Kotlin value is a platform `Int`
// (`.size`, an index) or a `Double`, these overloads keep the operator's own result type, so the call still compiles:
// an `Int` pair computes through the Long helper and narrows back (saturating), anything with a Double is the plain
// Double operator.
fun pyreonAdd(a: Int, b: Int): Int = pyreonNarrow(pyreonAdd(a.toLong(), b.toLong()))
fun pyreonAdd(a: Int, b: Long): Long = pyreonAdd(a.toLong(), b)
fun pyreonAdd(a: Long, b: Int): Long = pyreonAdd(a, b.toLong())
fun pyreonAdd(a: Double, b: Double): Double = a + b
fun pyreonAdd(a: Double, b: Long): Double = a + b
fun pyreonAdd(a: Long, b: Double): Double = a + b
fun pyreonAdd(a: Double, b: Int): Double = a + b
fun pyreonAdd(a: Int, b: Double): Double = a + b
fun pyreonSub(a: Int, b: Int): Int = pyreonNarrow(pyreonSub(a.toLong(), b.toLong()))
fun pyreonSub(a: Int, b: Long): Long = pyreonSub(a.toLong(), b)
fun pyreonSub(a: Long, b: Int): Long = pyreonSub(a, b.toLong())
fun pyreonSub(a: Double, b: Double): Double = a - b
fun pyreonSub(a: Double, b: Long): Double = a - b
fun pyreonSub(a: Long, b: Double): Double = a - b
fun pyreonSub(a: Double, b: Int): Double = a - b
fun pyreonSub(a: Int, b: Double): Double = a - b
fun pyreonMul(a: Int, b: Int): Int = pyreonNarrow(pyreonMul(a.toLong(), b.toLong()))
fun pyreonMul(a: Int, b: Long): Long = pyreonMul(a.toLong(), b)
fun pyreonMul(a: Long, b: Int): Long = pyreonMul(a, b.toLong())
fun pyreonMul(a: Double, b: Double): Double = a * b
fun pyreonMul(a: Double, b: Long): Double = a * b
fun pyreonMul(a: Long, b: Double): Double = a * b
fun pyreonMul(a: Double, b: Int): Double = a * b
fun pyreonMul(a: Int, b: Double): Double = a * b
fun pyreonNeg(a: Int): Int = if (a == Int.MIN_VALUE) Int.MAX_VALUE else -a
fun pyreonNeg(a: Double): Double = -a
fun pyreonRem(a: Int, b: Int): Int = pyreonNarrow(pyreonRem(a.toLong(), b.toLong()))
fun pyreonRem(a: Int, b: Long): Long = pyreonRem(a.toLong(), b)
fun pyreonRem(a: Long, b: Int): Long = pyreonRem(a, b.toLong())

private fun pyreonNarrow(v: Long): Int = if (v > Int.MAX_VALUE) Int.MAX_VALUE else if (v < Int.MIN_VALUE) Int.MIN_VALUE else v.toInt()

fun pyreonRem(a: Long, b: Long): Long {
    if (b == 0L) return pyreonIntegerResult(Double.NaN, "%")
    return a % b
}

/** The web's `%` on doubles (the JVM's `%` already truncates toward zero and gives NaN for a zero divisor). */
fun pyreonRem(a: Double, b: Double): Double = a % b
fun pyreonRem(a: Double, b: Long): Double = a % b
fun pyreonRem(a: Long, b: Double): Double = a % b

/** ECMAScript `ToInt32`: modulo 2^32 after truncation; NaN and ±Infinity are 0. */
fun pyreonToInt32(x: Number): Int = when (x) {
    is Double -> if (x.isNaN() || x.isInfinite()) 0 else (x - x % 1.0).rem(4_294_967_296.0).toLong().toInt()
    is Float -> pyreonToInt32(x.toDouble())
    else -> x.toLong().toInt()
}

fun pyreonBitAnd(a: Number, b: Number): Long = (pyreonToInt32(a) and pyreonToInt32(b)).toLong()
fun pyreonBitOr(a: Number, b: Number): Long = (pyreonToInt32(a) or pyreonToInt32(b)).toLong()
fun pyreonBitXor(a: Number, b: Number): Long = (pyreonToInt32(a) xor pyreonToInt32(b)).toLong()
fun pyreonBitNot(a: Number): Long = pyreonToInt32(a).inv().toLong()
fun pyreonShl(a: Number, b: Number): Long = (pyreonToInt32(a) shl (pyreonToInt32(b) and 31)).toLong()
fun pyreonShr(a: Number, b: Number): Long = (pyreonToInt32(a) shr (pyreonToInt32(b) and 31)).toLong()
fun pyreonUshr(a: Number, b: Number): Long = (pyreonToInt32(a) ushr (pyreonToInt32(b) and 31)).toLong() and 0xFFFFFFFFL

/** `Math.max(...xs)` / `Math.min(...xs)`: -Infinity / Infinity for an EMPTY list, NaN when any element is NaN. */
fun pyreonMax(xs: Iterable<Number>): Double {
    var r = Double.NEGATIVE_INFINITY
    for (n in xs) {
        val x = n.toDouble()
        if (x.isNaN()) return Double.NaN
        if (x > r || (x == 0.0 && r == 0.0 && 1.0 / r < 0)) r = x
    }
    return r
}

fun pyreonMin(xs: Iterable<Number>): Double {
    var r = Double.POSITIVE_INFINITY
    for (n in xs) {
        val x = n.toDouble()
        if (x.isNaN()) return Double.NaN
        if (x < r || (x == 0.0 && r == 0.0 && 1.0 / x < 0)) r = x
    }
    return r
}
