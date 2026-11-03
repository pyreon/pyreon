package com.pyreon.runtime

import android.icu.math.BigDecimal
import android.icu.text.DateFormat
import android.icu.text.DateTimePatternGenerator
import android.icu.text.NumberFormat
import android.icu.text.SimpleDateFormat
import android.icu.util.Currency
import android.icu.util.TimeZone
import android.icu.util.ULocale

// `Intl.DateTimeFormat` / `Intl.NumberFormat` (and the `toLocale*String`
// shapes) as the compiler lowers them — see
// `packages/native/compiler/src/intl-plugin.ts` for what lowers and
// `intl-options.ts` for how the ECMA-402 options become these parameters.
//
// `android.icu` is the same ICU V8 (the web) uses: component options arrive as
// the skeleton V8 builds, and `DateTimePatternGenerator.getBestPattern` with
// MATCH_HOUR_FIELD_LENGTH is the exact call V8 makes. What remains is CLDR
// DATA — each Android release ships its own ICU — which the emulator's
// `IntlDifferentialTest` measures against the V8 table.
//
// The two output adjustments match V8: U+202F NARROW NO-BREAK SPACE becomes a
// plain space in dates, and numbers round half away from zero (ICU's default is
// half-even).
//
// Formatters are cached by configuration, because the emit constructs one
// inline and inside a composable that recomposes on every state change. The
// cache is BOUNDED (oldest evicted first): an app that formats with a runtime
// locale or time zone would otherwise grow it without end. ICU formatters are
// not thread-safe, so the cache and each use are synchronized on the formatter.

/** How many distinct formatter configurations are kept per kind. */
const val PYREON_INTL_CACHE_LIMIT = 64

private class PyreonIntlCache<V> {
    private val entries = object : LinkedHashMap<String, V>(16, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, V>?): Boolean =
            size > PYREON_INTL_CACHE_LIMIT
    }

    @Synchronized
    fun value(key: String, make: () -> V): V = entries.getOrPut(key, make)

    @Synchronized
    fun size(): Int = entries.size
}

private val dateFormatters = PyreonIntlCache<DateFormat>()
private val numberFormatters = PyreonIntlCache<NumberFormat>()

/** Test hook: the number of cached formatters of each kind. */
fun pyreonIntlCacheSizes(): Pair<Int, Int> = dateFormatters.size() to numberFormatters.size()

private fun icuLocale(locale: String?): ULocale =
    if (locale == null) ULocale.getDefault() else ULocale.forLanguageTag(locale)

private fun icuDateStyle(style: String?): Int = when (style) {
    "full" -> DateFormat.FULL
    "long" -> DateFormat.LONG
    "medium" -> DateFormat.MEDIUM
    "short" -> DateFormat.SHORT
    else -> DateFormat.NONE
}

/** `new Intl.DateTimeFormat(locale, options)`. */
class PyreonDateTimeFormat(
    locale: String? = null,
    dateStyle: String? = null,
    timeStyle: String? = null,
    skeleton: String? = null,
    timeZone: String? = null,
) {
    private val formatter: DateFormat =
        dateFormatters.value(listOf(locale, dateStyle, timeStyle, skeleton, timeZone).joinToString("\u001F")) {
            val loc = icuLocale(locale)
            val f = if (skeleton != null) {
                val pattern = DateTimePatternGenerator.getInstance(loc)
                    .getBestPattern(skeleton, DateTimePatternGenerator.MATCH_HOUR_FIELD_LENGTH)
                SimpleDateFormat(pattern, loc)
            } else {
                DateFormat.getDateTimeInstance(icuDateStyle(dateStyle), icuDateStyle(timeStyle), loc)
            }
            // An unknown zone is the device zone — on the web it is a RangeError.
            if (timeZone != null && TimeZone.getCanonicalID(timeZone) != null) {
                f.timeZone = TimeZone.getTimeZone(timeZone)
            }
            f
        }

    /**
     * Format epoch milliseconds — what `Date.now()`, `new Date(ms)` and a number
     * signal all are natively. A non-finite value is JavaScript's `Invalid Date`
     * (where `format` throws a RangeError on the web).
     */
    fun format(epochMs: Number): String {
        val ms = epochMs.toDouble()
        if (ms.isNaN() || ms.isInfinite()) return "Invalid Date"
        val s = synchronized(formatter) { formatter.format(java.util.Date(ms.toLong())) }
        return s.replace(' ', ' ')
    }
}

/** `new Intl.NumberFormat(locale, options)` and `n.toLocaleString(locale, options)`. */
class PyreonNumberFormat(
    locale: String? = null,
    style: String = "decimal",
    currency: String? = null,
    currencyDisplay: String = "symbol",
    minimumFractionDigits: Int? = null,
    maximumFractionDigits: Int? = null,
    minimumIntegerDigits: Int? = null,
    useGrouping: Boolean = true,
) {
    private val formatter: NumberFormat = numberFormatters.value(
        listOf(
            locale, style, currency, currencyDisplay, minimumFractionDigits, maximumFractionDigits,
            minimumIntegerDigits, useGrouping,
        ).joinToString("\u001F"),
    ) {
        val loc = icuLocale(locale)
        val icuStyle = when (style) {
            "currency" -> when (currencyDisplay) {
                "code" -> NumberFormat.ISOCURRENCYSTYLE
                "name" -> NumberFormat.PLURALCURRENCYSTYLE
                else -> NumberFormat.CURRENCYSTYLE
            }
            "percent" -> NumberFormat.PERCENTSTYLE
            else -> NumberFormat.NUMBERSTYLE
        }
        val f = NumberFormat.getInstance(loc, icuStyle)
        // The currency first: setting it resets the fraction digits to that
        // currency's own (USD 2, JPY 0), which the defaults below build on.
        if (style == "currency" && currency != null) f.currency = Currency.getInstance(currency)
        // ECMA-402 rounds half away from zero; ICU defaults to half-even.
        f.roundingMode = BigDecimal.ROUND_HALF_UP
        val defaultMin = f.minimumFractionDigits
        val defaultMax = f.maximumFractionDigits
        when {
            minimumFractionDigits != null && maximumFractionDigits != null -> {
                f.maximumFractionDigits = maximumFractionDigits
                f.minimumFractionDigits = minOf(minimumFractionDigits, maximumFractionDigits)
            }
            minimumFractionDigits != null -> {
                f.maximumFractionDigits = maxOf(minimumFractionDigits, defaultMax)
                f.minimumFractionDigits = minimumFractionDigits
            }
            maximumFractionDigits != null -> {
                f.minimumFractionDigits = minOf(defaultMin, maximumFractionDigits)
                f.maximumFractionDigits = maximumFractionDigits
            }
        }
        if (minimumIntegerDigits != null) f.minimumIntegerDigits = minimumIntegerDigits
        f.isGroupingUsed = useGrouping
        f
    }

    fun format(value: Number): String {
        val v = value.toDouble()
        if (v.isNaN()) return "NaN"
        return synchronized(formatter) { formatter.format(v) }
    }
}
