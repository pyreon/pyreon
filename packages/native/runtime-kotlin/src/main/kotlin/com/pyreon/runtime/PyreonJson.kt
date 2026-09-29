// PyreonJson — JSON for the Compose target (mirror of PyreonJSON.swift).
//
// `encode` is the serialization helper for the `<WebView>` live-data bridge:
// PMTC emits `PyreonJson.encode(signal)` for `<WebView data={signal}>`, and it
// encodes any `@Serializable` value (PMTC-emitted data classes carry
// `@Serializable`) to a compact JSON string for the hosted page.
//
// `stringify` is what `JSON.stringify(x)` lowers to, and it is held to a
// stricter bar: the BYTES must equal the web's `JSON.stringify` for the same
// value, because they leave the device — a request body a server signs or
// hashes, a cache key, a string another client compares. kotlinx already keeps
// DECLARATION order (which PMTC derives from the source literal), so what it
// gets wrong is the leaves: a whole Double is `1.0` where JS writes `1`,
// exponents read `1.0E21` / `1.0E-7`, and NaN throws where JS writes `null`.
// So `stringify` lets kotlinx walk the value and then rewrites its output into
// ECMAScript's form — every number re-laid-out by `Number::toString`, every
// string re-escaped the way `JSON.stringify` escapes it. Structure and key
// order pass through untouched.
//
// Uses the same `Json.encodeToString(serializer<T>(), value)` surface as
// PyreonStorage, so it links against the same kotlinx-serialization API
// (covered by the runtime's kotlinc verify stubs).

package com.pyreon.runtime

import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

object PyreonJson {
    inline fun <reified T> encode(value: T): String =
        Json.encodeToString(serializer<T>(), value)

    /**
     * kotlinx configured for `stringify`: NaN / Infinity are written as tokens
     * (then read back as `null`, which is what JS writes) instead of throwing.
     * Defaults stay un-encoded, so an optional left at its `null` default is
     * OMITTED — the same as Swift's synthesized `encodeIfPresent`.
     */
    @PublishedApi
    internal val stringifyJson: Json = Json { allowSpecialFloatingPointValues = true }

    /** The web's `JSON.stringify(value)`, byte for byte. */
    inline fun <reified T> stringify(value: T): String =
        jsForm(stringifyJson.encodeToString(serializer<T>(), value))

    /**
     * Rewrite compact JSON (kotlinx output, which may carry NaN / Infinity
     * tokens) into exactly what `JSON.stringify` would have produced for the
     * same value. Structure and key order are unchanged.
     */
    fun jsForm(json: String): String {
        val out = StringBuilder(json.length)
        var i = 0
        val n = json.length
        while (i < n) {
            val c = json[i]
            when {
                c == '"' -> {
                    val raw = StringBuilder()
                    i++
                    while (json[i] != '"') {
                        val ch = json[i]
                        if (ch != '\\') {
                            raw.append(ch)
                            i++
                            continue
                        }
                        val e = json[i + 1]
                        when (e) {
                            'b' -> raw.append('\b')
                            'f' -> raw.append('\u000C')
                            'n' -> raw.append('\n')
                            'r' -> raw.append('\r')
                            't' -> raw.append('\t')
                            'u' -> {
                                raw.append(json.substring(i + 2, i + 6).toInt(16).toChar())
                                i += 4
                            }
                            else -> raw.append(e) // \" \\ \/
                        }
                        i += 2
                    }
                    i++
                    out.append(jsString(raw.toString()))
                }
                c == '-' || c == '+' || c == '.' || c in '0'..'9' || c == 'N' || c == 'I' -> {
                    val start = i
                    while (i < n && json[i] !in ",]}:") i++
                    val token = json.substring(start, i)
                    out.append(jsNumber(token.toDouble()))
                }
                else -> {
                    out.append(c)
                    i++
                }
            }
        }
        return out.toString()
    }

    /**
     * `Number::toString` as `JSON.stringify` applies it: the SHORTEST digits
     * that round-trip — the closest such string when several do — laid out
     * by the ECMAScript rules. Non-finite is `null`, `-0` is `0`.
     *
     * Searched with BigDecimal rather than read off `Double.toString`: the
     * JVM's `toString` was not guaranteed shortest before JDK 19, and Android's
     * libcore is its own implementation, so its digits cannot be trusted to
     * agree with V8's on every value.
     */
    fun jsNumber(value: Double): String {
        if (value.isNaN() || value.isInfinite()) return "null"
        if (value == 0.0) return "0"
        val abs = Math.abs(value)
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
        return (if (value < 0) "-" else "") + layout(digits, point)
    }

    /** ECMAScript Number::toString layout for digits `s` (k of them) at point `n`. */
    private fun layout(s: String, n: Int): String {
        val k = s.length
        if (k <= n && n <= 21) return s + "0".repeat(n - k)
        if (0 < n && n <= 21) return s.substring(0, n) + "." + s.substring(n)
        if (-6 < n && n <= 0) return "0." + "0".repeat(-n) + s
        val e = n - 1
        val tail = if (k == 1) "" else "." + s.substring(1)
        return s.substring(0, 1) + tail + "e" + (if (e < 0) "-" else "+") + Math.abs(e)
    }

    /**
     * A JSON string literal escaped exactly as `JSON.stringify` escapes one,
     * including a LONE surrogate as `\udxxx` (well-formed JSON.stringify).
     */
    fun jsString(value: String): String {
        val out = StringBuilder(value.length + 2)
        out.append('"')
        var i = 0
        while (i < value.length) {
            val c = value[i]
            when {
                c == '"' -> out.append("\\\"")
                c == '\\' -> out.append("\\\\")
                c == '\b' -> out.append("\\b")
                c == '\u000C' -> out.append("\\f")
                c == '\n' -> out.append("\\n")
                c == '\r' -> out.append("\\r")
                c == '\t' -> out.append("\\t")
                c < ' ' -> out.append("\\u").append(hex4(c))
                Character.isHighSurrogate(c) && i + 1 < value.length && Character.isLowSurrogate(value[i + 1]) -> {
                    out.append(c).append(value[i + 1])
                    i++
                }
                Character.isSurrogate(c) -> out.append("\\u").append(hex4(c))
                else -> out.append(c)
            }
            i++
        }
        return out.append('"').toString()
    }

    private fun hex4(c: Char): String = c.code.toString(16).padStart(4, '0')
}
