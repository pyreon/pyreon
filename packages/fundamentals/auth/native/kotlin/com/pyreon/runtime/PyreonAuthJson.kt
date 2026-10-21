package com.pyreon.runtime

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

// Pyreon auth — a strict RFC 8259 JSON reader for the provider responses and tokens the
// auth runtime parses (discovery, token response, JWKS, ID-token header/payload).
//
// Dependency-free on purpose: org.json is Android-SDK-only and kotlinx-serialization's
// tree API is not in the stub gate, and the auth runtime must RUN in the JVM smoke test,
// not just typecheck. Values map to Kotlin as:
//   object → Map<String, Any?>   array → List<Any?>   string → String
//   number → Double              true/false → Boolean  null → PyreonJsonNull
// so a JSON `null` stays distinguishable from an absent member (the ID-token `nbf`
// check depends on that, as on the web). Depth is capped and trailing input is an error.

/** The JSON `null` literal — distinct from an absent member (`map[key] == null`). */
public object PyreonJsonNull {
    override fun toString(): String = "null"
}

public object PyreonAuthJson {
    private const val MAX_DEPTH = 64

    /** Parse [text]; throws [IllegalArgumentException] on anything that is not exactly one JSON value. */
    public fun parse(text: String): Any {
        val p = Parser(text.removePrefix("﻿"))
        p.ws()
        val v = p.value(0)
        p.ws()
        require(p.i == p.s.length) { "trailing input at ${p.i}" }
        return v
    }

    /** Strict UTF-8 → JSON; null for invalid UTF-8 or invalid JSON. */
    public fun parse(bytes: ByteArray): Any? {
        val text = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString()
        } catch (_: CharacterCodingException) {
            return null
        }
        return try { parse(text) } catch (_: IllegalArgumentException) { null }
    }

    /** A JSON object, or null for any other value or invalid input. */
    @Suppress("UNCHECKED_CAST")
    public fun obj(bytes: ByteArray): Map<String, Any?>? = parse(bytes) as? Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    public fun obj(text: String): Map<String, Any?>? =
        try { parse(text) as? Map<String, Any?> } catch (_: IllegalArgumentException) { null }

    /** Serialise a map of strings / numbers / booleans / nested maps (the session record). */
    public fun stringify(v: Any?): String = buildString { write(this, v) }

    private fun write(out: StringBuilder, v: Any?) {
        when (v) {
            null, PyreonJsonNull -> out.append("null")
            is String -> {
                out.append('"')
                for (c in v) {
                    when (c) {
                        '"' -> out.append("\\\"")
                        '\\' -> out.append("\\\\")
                        '\n' -> out.append("\\n")
                        '\r' -> out.append("\\r")
                        '\t' -> out.append("\\t")
                        else -> if (c < ' ') out.append(String.format("\\u%04x", c.code)) else out.append(c)
                    }
                }
                out.append('"')
            }
            is Boolean -> out.append(v)
            is Number -> {
                val d = v.toDouble()
                if (d == Math.floor(d) && !d.isInfinite() && Math.abs(d) < 1e15) out.append(d.toLong()) else out.append(d)
            }
            is Map<*, *> -> {
                out.append('{')
                var first = true
                for ((k, value) in v) {
                    if (!first) out.append(',')
                    first = false
                    write(out, k.toString())
                    out.append(':')
                    write(out, value)
                }
                out.append('}')
            }
            is List<*> -> {
                out.append('[')
                v.forEachIndexed { i, value -> if (i > 0) out.append(','); write(out, value) }
                out.append(']')
            }
            else -> write(out, v.toString())
        }
    }

    private class Parser(val s: String) {
        var i = 0

        fun ws() {
            while (i < s.length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++
        }

        fun value(depth: Int): Any {
            require(depth <= MAX_DEPTH) { "nested too deeply" }
            require(i < s.length) { "unexpected end" }
            return when (val c = s[i]) {
                '{' -> obj(depth)
                '[' -> arr(depth)
                '"' -> str()
                't' -> lit("true", true)
                'f' -> lit("false", false)
                'n' -> lit("null", PyreonJsonNull)
                else -> if (c == '-' || c in '0'..'9') num() else throw IllegalArgumentException("unexpected '$c' at $i")
            }
        }

        private fun lit(word: String, v: Any): Any {
            require(s.startsWith(word, i)) { "bad literal at $i" }
            i += word.length
            return v
        }

        private fun obj(depth: Int): Map<String, Any?> {
            i++
            val m = LinkedHashMap<String, Any?>()
            ws()
            if (i < s.length && s[i] == '}') { i++; return m }
            while (true) {
                ws()
                require(i < s.length && s[i] == '"') { "expected key at $i" }
                val k = str()
                ws()
                require(i < s.length && s[i] == ':') { "expected ':' at $i" }
                i++
                ws()
                m[k] = value(depth + 1)
                ws()
                require(i < s.length) { "unexpected end" }
                if (s[i] == ',') { i++; continue }
                require(s[i] == '}') { "expected ',' or '}' at $i" }
                i++
                return m
            }
        }

        private fun arr(depth: Int): List<Any?> {
            i++
            val l = ArrayList<Any?>()
            ws()
            if (i < s.length && s[i] == ']') { i++; return l }
            while (true) {
                ws()
                l.add(value(depth + 1))
                ws()
                require(i < s.length) { "unexpected end" }
                if (s[i] == ',') { i++; continue }
                require(s[i] == ']') { "expected ',' or ']' at $i" }
                i++
                return l
            }
        }

        private fun str(): String {
            i++
            val b = StringBuilder()
            while (true) {
                require(i < s.length) { "unterminated string" }
                val c = s[i++]
                when {
                    c == '"' -> return b.toString()
                    c == '\\' -> {
                        require(i < s.length) { "bad escape" }
                        when (val e = s[i++]) {
                            '"' -> b.append('"')
                            '\\' -> b.append('\\')
                            '/' -> b.append('/')
                            'b' -> b.append('\b')
                            'f' -> b.append('\u000C')
                            'n' -> b.append('\n')
                            'r' -> b.append('\r')
                            't' -> b.append('\t')
                            'u' -> {
                                require(i + 4 <= s.length) { "bad \\u escape" }
                                val hex = s.substring(i, i + 4)
                                require(hex.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) { "bad \\u escape" }
                                b.append(hex.toInt(16).toChar())
                                i += 4
                            }
                            else -> throw IllegalArgumentException("bad escape '\\$e'")
                        }
                    }
                    c < ' ' -> throw IllegalArgumentException("control character in string at ${i - 1}")
                    else -> b.append(c)
                }
            }
        }

        private fun num(): Double {
            val start = i
            if (s[i] == '-') i++
            require(i < s.length && s[i] in '0'..'9') { "bad number at $start" }
            if (s[i] == '0') i++ else while (i < s.length && s[i] in '0'..'9') i++
            if (i < s.length && s[i] == '.') {
                i++
                require(i < s.length && s[i] in '0'..'9') { "bad fraction at $start" }
                while (i < s.length && s[i] in '0'..'9') i++
            }
            if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                i++
                if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
                require(i < s.length && s[i] in '0'..'9') { "bad exponent at $start" }
                while (i < s.length && s[i] in '0'..'9') i++
            }
            return s.substring(start, i).toDouble()
        }
    }
}
