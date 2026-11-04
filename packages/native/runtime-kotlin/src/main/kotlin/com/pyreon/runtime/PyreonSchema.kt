// PyreonSchema — the types every PMTC-emitted schema data class shares
// (mirror of PyreonSchema.swift).
//
// A file-scope `s.object({ … })` / `z.object({ … })` lowers to a data class
// whose `parse` throws `PyreonSchemaError` and whose `safeParseResult` returns
// a `PyreonParseResult`. These used to be emitted INTO each file that declared
// a schema; two such files in one Gradle source set are one package, so each
// declared `PyreonSchemaError` and the build failed with a redeclaration.
// Declared once, here, they cannot collide.

package com.pyreon.runtime

import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

sealed class PyreonSchemaError(message: String) : Exception(message) {
    data class MissingOrWrongType(val field: String, val expected: String) :
        PyreonSchemaError("Field '$field' missing or wrong type (expected $expected)")
    data class ConstraintViolation(val field: String, val rule: String) :
        PyreonSchemaError("Field '$field' violated constraint '$rule'")
}

/** The web-faithful `{ success, data }` result of `Schema.safeParse(x)`. */
data class PyreonParseResult<T>(val success: Boolean, val data: T?)

// Each schema library's `parse` has its OWN web result shape, reproduced here rather than borrowing zod's:
// `@pyreon/validate`'s `s.object(…).parse(x)` / `.safeParse(x)` (the same method) and a `@pyreon/validation`
// adapter's `parse(x)` both return `{ ok, value } | { ok: false, issues }` and never throw; the validate issue's
// `path` is a list of keys, the adapter's a dot-string. `value` is non-null-typed because the shared source reads it
// only after narrowing on `ok` (TypeScript rejects `r.value` otherwise), so `r.value.name` must compile as written;
// reading it on a failed result throws. A native parse stops at the first failing field, so `issues` holds at most
// one entry where the web may report several.

/** One `@pyreon/validate` issue: the message and the key path (`["address", "city"]`). */
data class PyreonValidateIssue(val message: String, val path: List<String>)

/** `@pyreon/validate`'s `{ ok, value } | { ok: false, issues }`. */
class PyreonValidateResult<T : Any>(val ok: Boolean, private val parsed: T?, val issues: List<PyreonValidateIssue>) {
    val value: T get() = parsed ?: throw IllegalStateException("[Pyreon] read .value of a failed parse — check .ok first")
}

/** One `@pyreon/validation` adapter issue: the message and a dot-separated path (`"address.city"`). */
data class PyreonValidationIssue(val path: String, val message: String)

/** A `@pyreon/validation` adapter's `parse` result: `{ ok, value } | { ok: false, issues }`. */
class PyreonValidationResult<T : Any>(val ok: Boolean, private val parsed: T?, val issues: List<PyreonValidationIssue>) {
    val value: T get() = parsed ?: throw IllegalStateException("[Pyreon] read .value of a failed parse — check .ok first")
}

fun pyreonIssueField(e: Throwable): String = when (e) {
    is PyreonSchemaError.MissingOrWrongType -> e.field
    is PyreonSchemaError.ConstraintViolation -> e.field
    else -> ""
}

/** Run a native schema `parse` and report it as `@pyreon/validate` does: never throwing. */
inline fun <T : Any> pyreonValidateResult(parse: () -> T): PyreonValidateResult<T> =
    try {
        PyreonValidateResult(true, parse(), emptyList())
    } catch (e: PyreonSchemaError) {
        val field = pyreonIssueField(e)
        PyreonValidateResult(false, null, listOf(PyreonValidateIssue(e.message ?: "Schema validation failed", if (field.isEmpty()) emptyList() else field.split(".").toList())))
    }

/** Run a native schema `parse` and report it as a `@pyreon/validation` adapter's `parse` does: never throwing. */
inline fun <T : Any> pyreonValidationResult(parse: () -> T): PyreonValidationResult<T> =
    try {
        PyreonValidationResult(true, parse(), emptyList())
    } catch (e: PyreonSchemaError) {
        PyreonValidationResult(false, null, listOf(PyreonValidationIssue(pyreonIssueField(e), e.message ?: "Schema validation failed")))
    }

// Typed values as schema input.
//
// An emitted schema's `parse` reads a `Map<String, Any?>` — the shape an
// object LITERAL lowers to. `Pet.safeParse(pet())`, where `pet` holds a
// @Serializable data class, has to reach the same shape, so the value goes
// through its own serializer to JSON and back out as plain values. The JSON
// round trip applies the class's REAL serialization (names, nested classes,
// nulls) rather than a second hand-rolled reading that could disagree; the
// reader below is dependency-free so it is tested without kotlinx.

/** A typed value as the `Map<String, Any?>` an emitted schema's `parse` reads. */
inline fun <reified T> pyreonSchemaInput(value: T): Map<String, Any?> {
    @Suppress("UNCHECKED_CAST")
    return pyreonSchemaValue(value) as? Map<String, Any?> ?: emptyMap()
}

/** Already a map (a literal lowered elsewhere): passed through. */
fun pyreonSchemaInput(value: Map<String, Any?>): Map<String, Any?> = value

/** A typed value as the plain value (String/Int/Double/Boolean/List/Map/null) a schema reads. */
inline fun <reified T> pyreonSchemaValue(value: T): Any? =
    pyreonSchemaJson(Json.encodeToString(serializer<T>(), value))

/**
 * Parse JSON text into plain values. A number that is integral and fits an
 * Int becomes an Int (JS has one number type, and the schema's `as? Int` must
 * accept `3.0` exactly as Swift's NSNumber bridging does); anything else is a
 * Double. Malformed input yields null — a schema rejects it, it never throws.
 */
fun pyreonSchemaJson(text: String): Any? {
    val reader = PyreonSchemaJsonReader(text)
    return try {
        val v = reader.value()
        reader.skipWs()
        if (reader.atEnd()) v else null
    } catch (_: IllegalArgumentException) {
        null
    }
}

class PyreonSchemaJsonReader(private val s: String) {
    private var i = 0

    fun atEnd(): Boolean = i >= s.length

    fun skipWs() {
        while (i < s.length && s[i].isWhitespace()) i++
    }

    fun value(): Any? {
        skipWs()
        require(i < s.length) { "unexpected end" }
        return when (s[i]) {
            '{' -> obj()
            '[' -> arr()
            '"' -> str()
            't' -> word("true", true)
            'f' -> word("false", false)
            'n' -> word("null", null)
            else -> num()
        }
    }

    private fun word(w: String, v: Any?): Any? {
        require(s.startsWith(w, i)) { "bad literal" }
        i += w.length
        return v
    }

    private fun obj(): Map<String, Any?> {
        val out = LinkedHashMap<String, Any?>()
        i++
        skipWs()
        if (i < s.length && s[i] == '}') { i++; return out }
        while (true) {
            skipWs()
            val k = str()
            skipWs()
            require(i < s.length && s[i] == ':') { "expected :" }
            i++
            out[k] = value()
            skipWs()
            require(i < s.length) { "unexpected end" }
            if (s[i] == ',') { i++; continue }
            require(s[i] == '}') { "expected }" }
            i++
            return out
        }
    }

    private fun arr(): List<Any?> {
        val out = ArrayList<Any?>()
        i++
        skipWs()
        if (i < s.length && s[i] == ']') { i++; return out }
        while (true) {
            out.add(value())
            skipWs()
            require(i < s.length) { "unexpected end" }
            if (s[i] == ',') { i++; continue }
            require(s[i] == ']') { "expected ]" }
            i++
            return out
        }
    }

    private fun str(): String {
        require(i < s.length && s[i] == '"') { "expected string" }
        i++
        val b = StringBuilder()
        while (true) {
            require(i < s.length) { "unterminated string" }
            val c = s[i++]
            when (c) {
                '"' -> return b.toString()
                '\\' -> {
                    require(i < s.length) { "bad escape" }
                    when (val e = s[i++]) {
                        'n' -> b.append('\n')
                        't' -> b.append('\t')
                        'r' -> b.append('\r')
                        'b' -> b.append('\b')
                        'f' -> b.append('\u000C')
                        'u' -> {
                            require(i + 4 <= s.length) { "bad unicode escape" }
                            b.append(s.substring(i, i + 4).toInt(16).toChar())
                            i += 4
                        }
                        else -> b.append(e)
                    }
                }
                else -> b.append(c)
            }
        }
    }

    private fun num(): Any {
        val start = i
        while (i < s.length && (s[i].isDigit() || s[i] in "+-.eE")) i++
        val d = s.substring(start, i).toDoubleOrNull()
        require(d != null) { "bad number" }
        return if (d == Math.floor(d) && d >= Int.MIN_VALUE && d <= Int.MAX_VALUE) d.toInt() else d
    }
}
