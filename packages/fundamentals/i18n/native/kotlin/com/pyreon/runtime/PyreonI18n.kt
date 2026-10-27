// PyreonI18n — Compose side of @pyreon/i18n's reactive translation
// surface. Mirrors the Swift `PyreonI18n` one-for-one, and the web
// `createI18n` for the static-messages subset PMTC lowers:
//
//     i18n.t("hello")                       // lookup along the locale chain
//     i18n.t("files", mapOf("count" to 3))  // CLDR plural category + {{count}}
//     i18n.locale                           // read  (web `i18n.locale()`)
//     i18n.locale = "pl"                    // write (web `i18n.locale.set('pl')`)
//
// Plurals: the CLDR 48 cardinal rules are carried as DATA
// (`PyreonPluralRules.table`, identical to the Swift port's table) plus a
// small evaluator for the CLDR rule syntax. `android.icu.text.PluralRules`
// would cover more languages on API 24+, but it is not reachable from the
// dependency-free JVM test harness, and — the point of the exercise — it
// would let Android and iOS pick DIFFERENT forms for the same message table.
// One table, two evaluators, one shared case list checked against
// `Intl.PluralRules`. A locale outside the table uses the English-shaped
// one/other rule, as the web side does when `Intl.PluralRules` is missing.

package com.pyreon.runtime

import androidx.compose.runtime.mutableStateOf
import java.math.BigDecimal
import java.math.RoundingMode

class PyreonI18n(
    initialLocale: String,
    val messages: Map<String, Map<String, String>>,
    val fallbackLocale: String? = null,
) {
    private val _locale = mutableStateOf(initialLocale)

    /**
     * Currently-active locale. Writable: `i18n.locale.set('pl')` lowers to
     * `i18n.locale = "pl"`; every composable that called `t()` recomposes
     * because `t()` reads the backing state.
     */
    var locale: String
        get() = _locale.value
        set(value) { _locale.value = value }

    /** Web `localeChain`: active locale stepped down, then the fallback, de-duplicated. */
    internal fun localeChain(): List<String> {
        val out = LinkedHashSet<String>()
        out.addAll(stepDown(_locale.value))
        if (fallbackLocale != null) out.addAll(stepDown(fallbackLocale))
        return out.toList()
    }

    private fun lookup(candidates: List<String>): String? {
        for (loc in localeChain()) {
            val dict = messages[loc] ?: continue
            for (c in candidates) dict[c]?.let { return it }
        }
        return null
    }

    /** `i18n.t("hello")` — look up `key` along the locale chain; the key verbatim on miss. */
    fun t(key: String): String = lookup(listOf(key)) ?: key

    /**
     * Two-arg `t(key, values)` — interpolation + plurals, mirroring the web
     * contract: `{{name}}` placeholders, and when `values["count"]` is present
     * the candidates `key_zero` (count == 0 only), `key_<CLDR category>`,
     * `key_other`, then the bare `key`.
     */
    fun t(key: String, values: Map<String, Any?>): String {
        var candidates = listOf(key)
        if (values.containsKey("count")) {
            val raw = values["count"]
            val count = (raw as? Number)?.toDouble() ?: raw?.toString()?.toDoubleOrNull() ?: Double.NaN
            val suffixes = LinkedHashSet<String>()
            if (count == 0.0) suffixes.add("zero")
            suffixes.add(PyreonPluralRules.select(_locale.value, count))
            suffixes.add("other")
            candidates = suffixes.map { "${key}_$it" } + key
        }
        var out = lookup(candidates) ?: key
        for ((name, value) in values) {
            out = out.replace("{{${name}}}", value?.toString() ?: "")
        }
        return out
    }

    companion object {
        internal fun stepDown(tag: String): List<String> {
            val out = mutableListOf(tag)
            var cur = tag
            while (true) {
                val idx = cur.indexOfLast { it == '-' || it == '_' }
                if (idx <= 0) break
                cur = cur.substring(0, idx)
                out.add(cur)
            }
            return out
        }
    }
}

/** CLDR cardinal plural rules as data + an evaluator. Table identical to the Swift port's. */
object PyreonPluralRules {
    /** `languages` (space-separated) to ordered `category to CLDR rule`. Source: CLDR 48 `plurals.xml`. */
    // <cldr-plural-table>
    internal val table: List<Pair<String, List<Pair<String, String>>>> = listOf(
        "ja zh ko th vi id ms" to emptyList<Pair<String, String>>(),
        "en de nl sv fi et" to listOf("one" to "i = 1 and v = 0"),
        "it ca" to listOf("one" to "i = 1 and v = 0", "many" to "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5"),
        "es" to listOf("one" to "n = 1", "many" to "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5"),
        "fr" to listOf("one" to "i = 0,1", "many" to "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5"),
        "pt" to listOf("one" to "i = 0..1", "many" to "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5"),
        "pt-pt" to listOf("one" to "i = 1 and v = 0", "many" to "e = 0 and i != 0 and i % 1000000 = 0 and v = 0 or e != 0..5"),
        "tr hu el nb no bg" to listOf("one" to "n = 1"),
        "da" to listOf("one" to "n = 1 or t != 0 and i = 0,1"),
        "hi" to listOf("one" to "i = 0 or n = 1"),
        "cs sk" to listOf("one" to "i = 1 and v = 0", "few" to "i = 2..4 and v = 0", "many" to "v != 0"),
        "pl" to listOf("one" to "i = 1 and v = 0", "few" to "v = 0 and i % 10 = 2..4 and i % 100 != 12..14", "many" to "v = 0 and i != 1 and i % 10 = 0..1 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 12..14"),
        "ru uk" to listOf("one" to "v = 0 and i % 10 = 1 and i % 100 != 11", "few" to "v = 0 and i % 10 = 2..4 and i % 100 != 12..14", "many" to "v = 0 and i % 10 = 0 or v = 0 and i % 10 = 5..9 or v = 0 and i % 100 = 11..14"),
        "hr sr bs" to listOf("one" to "v = 0 and i % 10 = 1 and i % 100 != 11 or f % 10 = 1 and f % 100 != 11", "few" to "v = 0 and i % 10 = 2..4 and i % 100 != 12..14 or f % 10 = 2..4 and f % 100 != 12..14"),
        "sl" to listOf("one" to "v = 0 and i % 100 = 1", "two" to "v = 0 and i % 100 = 2", "few" to "v = 0 and i % 100 = 3..4 or v != 0"),
        "lt" to listOf("one" to "n % 10 = 1 and n % 100 != 11..19", "few" to "n % 10 = 2..9 and n % 100 != 11..19", "many" to "f != 0"),
        "lv" to listOf("zero" to "n % 10 = 0 or n % 100 = 11..19 or v = 2 and f % 100 = 11..19", "one" to "n % 10 = 1 and n % 100 != 11 or v = 2 and f % 10 = 1 and f % 100 != 11 or v != 2 and f % 10 = 1"),
        "ro" to listOf("one" to "i = 1 and v = 0", "few" to "v != 0 or n = 0 or n != 1 and n % 100 = 1..19"),
        "he" to listOf("one" to "i = 1 and v = 0 or i = 0 and v != 0", "two" to "i = 2 and v = 0"),
        "ar" to listOf("zero" to "n = 0", "one" to "n = 1", "two" to "n = 2", "few" to "n % 100 = 3..10", "many" to "n % 100 = 11..99"),
    )
    // </cldr-plural-table>

    /** Used for a locale the table does not cover (English-shaped). */
    internal val defaultRules: List<Pair<String, String>> = listOf("one" to "i = 1 and v = 0")

    private val byLanguage: Map<String, List<Pair<String, String>>> by lazy {
        val out = HashMap<String, List<Pair<String, String>>>()
        for ((langs, rules) in table) for (lang in langs.split(" ")) out[lang] = rules
        out
    }

    internal fun rulesFor(locale: String): List<Pair<String, String>> {
        val tag = locale.lowercase().replace('_', '-')
        for (step in PyreonI18n.stepDown(tag)) byLanguage[step]?.let { return it }
        return defaultRules
    }

    /** The CLDR cardinal category for `count` in `locale`. NaN / infinity → `other`. */
    fun select(locale: String, count: Double): String {
        if (count.isNaN() || count.isInfinite()) return "other"
        val ops = Operands.of(count)
        for ((category, rule) in rulesFor(locale)) if (matches(rule, ops)) return category
        return "other"
    }

    /** CLDR operands as `Intl.PluralRules` formats by default: |x|, half-up to 3 fraction digits, trailing zeros dropped. */
    internal class Operands(val n: Double, val i: Double, val v: Double, val f: Double, val t: Double) {
        fun value(op: Char): Double = when (op) {
            'n' -> n
            'i' -> i
            'v', 'w' -> v
            'f' -> f
            't' -> t
            else -> 0.0 // c / e (compact exponent): always 0 for a plain count
        }

        companion object {
            fun of(count: Double): Operands {
                // Round the shortest decimal form, not the binary value (1.2345 → 1.235).
                val text = BigDecimal.valueOf(Math.abs(count)).setScale(3, RoundingMode.HALF_UP).toPlainString()
                val dot = text.indexOf('.')
                val whole = if (dot < 0) text else text.substring(0, dot)
                val fraction = if (dot < 0) "" else text.substring(dot + 1).trimEnd('0')
                val f = if (fraction.isEmpty()) 0.0 else fraction.toDouble()
                val n = (if (fraction.isEmpty()) whole else "$whole.$fraction").toDouble()
                return Operands(n, whole.toDouble(), fraction.length.toDouble(), f, f)
            }
        }
    }

    internal fun matches(rule: String, ops: Operands): Boolean =
        rule.split(" or ").any { part -> part.split(" and ").all { relationHolds(it, ops) } }

    private fun relationHolds(relation: String, ops: Operands): Boolean {
        val negate = relation.contains("!=")
        val sides = relation.split(if (negate) "!=" else "=")
        if (sides.size != 2) return false
        val lhs = sides[0].trim()
        if (lhs.isEmpty()) return false
        var value = ops.value(lhs[0])
        val pct = lhs.indexOf('%')
        if (pct >= 0) {
            val mod = lhs.substring(pct + 1).trim().toDoubleOrNull()
            if (mod != null) value %= mod
        }
        var inList = false
        for (item in sides[1].trim().split(",")) {
            val bounds = item.split("..")
            val lo = bounds[0].toDoubleOrNull() ?: continue
            val hi = (if (bounds.size > 1) bounds[1] else bounds[0]).toDoubleOrNull() ?: continue
            // A range matches integers only; a single value matches by equality.
            val hit = if (bounds.size > 1) value == Math.floor(value) && value >= lo && value <= hi else value == lo
            if (hit) { inList = true; break }
        }
        return if (negate) !inList else inList
    }
}
