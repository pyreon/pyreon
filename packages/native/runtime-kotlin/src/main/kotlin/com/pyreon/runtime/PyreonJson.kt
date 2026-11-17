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

import kotlinx.serialization.SerializationException
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

    /** kotlinx configured for `parse`: unknown keys are ignored, as `JSON.parse` and Swift's JSONDecoder do. */
    @PublishedApi
    internal val parseJson: Json = Json { ignoreUnknownKeys = true }

    /**
     * What `JSON.parse(text)` lowers to when the source names the result type. Stricter than the web by
     * construction: input whose SHAPE does not match `T` throws here, where `JSON.parse` would have returned it.
     * A syntax error and a shape mismatch both throw [PyreonJsonParseError].
     */
    inline fun <reified T> parse(text: String): T =
        try {
            parseJson.decodeFromString(serializer<T>(), integralNumbers(text))
        } catch (e: SerializationException) {
            throw PyreonJsonParseError(parseErrorMessage(e))
        }

    /**
     * A fetch / query / stream body decoded into `T` — what every emitted Kotlin decode site calls. Unknown keys are
     * ignored (as [parse], and as Swift's `JSONDecoder`); a malformed body throws kotlinx's own exception.
     */
    inline fun <reified T> decode(text: String): T = parseJson.decodeFromString(serializer<T>(), integralNumbers(text))

    /**
     * Every number token that is a WHOLE value written with a fraction or an exponent (`3.0`, `1e3`, `-0.0`) rewritten
     * as an integer (`3`, `1000`, `-0`). JSON has one number type and the web reads `3.0` and `3` as the same value, so a
     * TS `number` field PMTC types as an integer must accept both — Swift's `JSONDecoder` does, kotlinx rejected `3.0`
     * for a `Long` and the whole decode failed. A `Double` field reads the integer text to the same value. Strings,
     * fractional values and magnitudes past 2^63 are left alone.
     */
    @PublishedApi
    internal fun integralNumbers(text: String): String {
        var out: StringBuilder? = null
        var i = 0
        val n = text.length
        var copied = 0
        while (i < n) {
            val c = text[i]
            if (c == '"') {
                i++
                while (i < n && text[i] != '"') i += if (text[i] == '\\') 2 else 1
                i++
                continue
            }
            if (c == '-' || (c in '0'..'9')) {
                val start = i
                i++
                while (i < n && (text[i] in '0'..'9' || text[i] == '.' || text[i] == 'e' || text[i] == 'E' || text[i] == '+' || text[i] == '-')) i++
                val token = text.substring(start, i)
                if (token.any { it == '.' || it == 'e' || it == 'E' }) {
                    val v = token.toDoubleOrNull()
                    if (v != null && !v.isInfinite() && v == Math.floor(v) && Math.abs(v) < 9.2e18) {
                        val sb = out ?: StringBuilder(n).also { out = it }
                        sb.append(text, copied, start)
                        sb.append(if (v == 0.0 && token.startsWith('-')) "-0" else v.toLong().toString())
                        copied = i
                    }
                }
                continue
            }
            i++
        }
        val sb = out ?: return text
        sb.append(text, copied, n)
        return sb.toString()
    }

    /** kotlinx's message is multi-line, with tuning hints after the first line; keep the diagnosis. */
    @PublishedApi
    internal fun parseErrorMessage(e: SerializationException): String =
        e.message?.lineSequence()?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() } ?: "Unexpected token in JSON"

    /** The web's `JSON.stringify(value)`, byte for byte. */
    inline fun <reified T> stringify(value: T): String =
        jsForm(propertyOrder(stringifyJson.encodeToString(serializer<T>(), value)))

    /**
     * Compact JSON (kotlinx output) with every object's members in a JavaScript object's own-property order: the
     * array-index keys ascending, then the rest as written. kotlinx writes a map in insertion order, which is the
     * web's order for every key but those.
     */
    @PublishedApi
    internal fun propertyOrder(json: String): String {
        // Only an array-index KEY can move: a quote, digits, a quote and a colon (compact JSON has no space there,
        // and inside a string every quote is escaped).
        if (!ARRAY_INDEX_KEY.containsMatchIn(json)) return json
        val out = StringBuilder(json.length)
        PropertyOrderWriter(json).value(out)
        return out.toString()
    }

    private val ARRAY_INDEX_KEY = Regex("\"(0|[1-9][0-9]{0,9})\":")

    /** A recursive copy of compact JSON that reorders each object's members. */
    private class PropertyOrderWriter(private val s: String) {
        private var i = 0

        fun value(out: StringBuilder) {
            when (s[i]) {
                '{' -> obj(out)
                '[' -> {
                    out.append('[')
                    i++
                    if (s[i] == ']') { i++; out.append(']'); return }
                    while (true) {
                        value(out)
                        val c = s[i++]
                        out.append(c)
                        if (c == ']') return
                    }
                }
                '"' -> out.append(s, i, string().also { i = it })
                else -> {
                    val start = i
                    while (i < s.length && s[i] != ',' && s[i] != '}' && s[i] != ']') i++
                    out.append(s, start, i)
                }
            }
        }

        /** The end index of the string literal starting at `i`. */
        private fun string(): Int {
            var j = i + 1
            while (s[j] != '"') j += if (s[j] == '\\') 2 else 1
            return j + 1
        }

        private fun obj(out: StringBuilder) {
            i++
            val members = ArrayList<Pair<String, String>>()
            if (s[i] != '}') {
                while (true) {
                    val keyEnd = string()
                    val key = s.substring(i, keyEnd)
                    i = keyEnd + 1 // past the colon
                    val member = StringBuilder()
                    member.append(key).append(':')
                    value(member)
                    members.add(key to member.toString())
                    if (s[i++] == '}') break
                }
            } else {
                i++
            }
            out.append('{')
            // The key literal of an array index is plain digits in quotes, so it needs no unescaping here.
            pyreonPropertyOrder(members) { it.first.substring(1, it.first.length - 1) }
                .forEachIndexed { n, m -> if (n > 0) out.append(','); out.append(m.second) }
            out.append('}')
        }
    }

    /**
     * Rewrite compact JSON (kotlinx output, which may carry NaN / Infinity
     * tokens) into exactly what `JSON.stringify` would have produced for the
     * same value. Structure and key order are unchanged.
     */
    @PublishedApi
    internal fun jsForm(json: String): String {
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
    internal fun jsNumber(value: Double): String {
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
    internal fun jsString(value: String): String {
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

// ─── A string-keyed Record's own-property order ──────────────────────────────
//
// A JavaScript object does not list its keys in plain insertion order: `Object.keys`, `Object.values` and
// `JSON.stringify` put the ARRAY-INDEX keys ("0", "7", "42" — canonical integers up to 2^32 − 2) first, in ascending
// numeric order, and every other key after them in insertion order. `{ b: 1, '2': 2, '1': 3 }` lists `1,2,b`. A `Map`
// keeps plain insertion order, and both lower to the same `LinkedHashMap`, so the rule is applied where a RECORD is
// observed — `Object.keys(r)` / `Object.values(r)` lower to the functions below, and `stringify` reorders its output —
// never to the map itself. (The Swift twin lives in PyreonCollections.swift.)

/** The value of an array-index key ("0", or a digit 1–9 followed by digits, at most 2^32 − 2), or `null`. */
fun pyreonArrayIndex(key: String): Long? {
    if (key.isEmpty() || key.length > 10 || key[0] !in '0'..'9') return null
    if (key[0] == '0') return if (key.length == 1) 0L else null
    var n = 0L
    for (c in key) {
        if (c !in '0'..'9') return null
        n = n * 10 + (c - '0')
    }
    return if (n <= 4_294_967_294L) n else null
}

/** [items] (in insertion order) in a JavaScript object's own-property order of their [key]s. */
inline fun <T> pyreonPropertyOrder(items: List<T>, key: (T) -> String): List<T> {
    var indexed: MutableList<Pair<Long, T>>? = null
    val rest = ArrayList<T>(items.size)
    for (item in items) {
        val n = pyreonArrayIndex(key(item))
        if (n == null) rest.add(item) else (indexed ?: ArrayList<Pair<Long, T>>().also { indexed = it }).add(n to item)
    }
    val idx = indexed ?: return items
    return idx.sortedBy { it.first }.map { it.second } + rest
}

/** `Object.keys(record)`. */
fun <V> pyreonRecordKeys(record: Map<String, V>): List<String> = pyreonPropertyOrder(record.keys.toList()) { it }

/** `Object.values(record)`, in the order `Object.keys` lists the keys. */
fun <V> pyreonRecordValues(record: Map<String, V>): List<V> =
    pyreonPropertyOrder(record.entries.toList()) { it.key }.map { it.value }

/** The error a lowered `JSON.parse` throws. `message` is the bare text; `toString()` reads as `String(e)` does on the web. */
class PyreonJsonParseError(message: String) : Exception(message) {
    override fun toString(): String = "SyntaxError: $message"
}
