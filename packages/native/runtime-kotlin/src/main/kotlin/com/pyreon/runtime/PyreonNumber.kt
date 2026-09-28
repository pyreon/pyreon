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
