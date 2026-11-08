package com.pyreon.runtime

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime

// JavaScript's `Date`, for emitted code — the mirror of the Swift runtime's `PyreonDate.swift`. A date IS its epoch
// milliseconds (a Double, NaN when invalid); the getters read the device time zone (the web's local time) or UTC with
// JavaScript's conventions (0-based month, Sunday = 0); parsing accepts the ECMAScript date-time string format, a
// date-only form being UTC and a date-time form without an offset LOCAL.

private fun zoneOf(utc: Boolean): ZoneId = if (utc) ZoneOffset.UTC else ZoneId.systemDefault()

/** `new Date(text)` / `Date.parse(text)`. */
fun pyreonDateFrom(text: String): Double = pyreonDateParse(text)

/** `new Date(ms)`: the milliseconds, truncated toward zero as the web's TimeClip does. */
fun pyreonDateFrom(ms: Number): Double {
    val d = ms.toDouble()
    return if (d.isFinite() && Math.abs(d) <= 8.64e15) (if (d < 0) Math.ceil(d) else Math.floor(d)) + 0.0 else Double.NaN
}

/** `d.getFullYear()` … `d.getMilliseconds()` and their `getUTC…` twins (`field` as in the Swift runtime). */
fun pyreonDateGet(ms: Number, field: Number, utc: Boolean): Double {
    val m = ms.toDouble()
    if (!m.isFinite()) return Double.NaN
    val whole = Math.floor(m / 1000)
    val t = Instant.ofEpochSecond(whole.toLong()).atZone(zoneOf(utc))
    return when (field.toInt()) {
        0 -> t.year.toDouble()
        1 -> (t.monthValue - 1).toDouble()
        2 -> t.dayOfMonth.toDouble()
        3 -> (t.dayOfWeek.value % 7).toDouble()
        4 -> t.hour.toDouble()
        5 -> t.minute.toDouble()
        6 -> t.second.toDouble()
        else -> m - whole * 1000
    }
}

/** `d.getTimezoneOffset()`: minutes from local time to UTC at that instant (positive west of Greenwich). */
fun pyreonDateTimezoneOffset(ms: Number): Double {
    val m = ms.toDouble()
    if (!m.isFinite()) return Double.NaN
    val seconds = ZoneId.systemDefault().rules.getOffset(Instant.ofEpochMilli(m.toLong())).totalSeconds
    return -seconds / 60.0
}

/** `d.toISOString()` in UTC; `Invalid Date` for an invalid date (the web throws a RangeError). */
fun pyreonDateISO(ms: Number): String {
    val m = ms.toDouble()
    if (!m.isFinite()) return "Invalid Date"
    val y = pyreonDateGet(m, 0, true).toInt()
    val year = if (y in 0..9999) String.format("%04d", y) else (if (y < 0) "-" else "+") + String.format("%06d", Math.abs(y))
    return String.format(
        "%s-%02d-%02dT%02d:%02d:%02d.%03dZ",
        year,
        pyreonDateGet(m, 1, true).toInt() + 1,
        pyreonDateGet(m, 2, true).toInt(),
        pyreonDateGet(m, 4, true).toInt(),
        pyreonDateGet(m, 5, true).toInt(),
        pyreonDateGet(m, 6, true).toInt(),
        pyreonDateGet(m, 7, true).toInt(),
    )
}

/** `new Date(y, m, d, h, mi, s, ms)` (local) / `Date.UTC(…)`: parts roll over, and a year 0…99 means 1900…1999. */
fun pyreonDateMake(utc: Boolean, vararg parts: Number): Double {
    val p = parts.map { it.toDouble() }.toMutableList()
    if (p.any { !it.isFinite() }) return Double.NaN
    for (i in p.indices) p[i] = if (p[i] < 0) Math.ceil(p[i]) else Math.floor(p[i])
    while (p.size < 7) p.add(if (p.size == 2) 1.0 else 0.0)
    var year = p[0]
    if (year in 0.0..99.0) year += 1900
    return pyreonDateCompose(utc, year.toLong(), p[1].toLong(), p[2].toLong(), p[3].toLong(), p[4].toLong(), p[5].toLong(), p[6])
}

private fun pyreonDateCompose(utc: Boolean, year: Long, month: Long, day: Long, h: Long, mi: Long, s: Long, ms: Double): Double {
    // The calendar day in UTC arithmetic (every day 24 h), then the wall-clock time resolved by the zone.
    val date = LocalDate.of(0, 1, 1).plusYears(year).plusMonths(month).plusDays(day - 1)
    val wall = LocalDateTime.of(date, java.time.LocalTime.MIDNIGHT).plusHours(h).plusMinutes(mi).plusSeconds(s)
    val instant = if (utc) wall.toInstant(ZoneOffset.UTC) else ZonedDateTime.of(
        wall.toLocalDate(), wall.toLocalTime(), ZoneId.systemDefault(),
    ).toInstant()
    return pyreonDateFrom(instant.toEpochMilli().toDouble() + ms)
}

private fun pyreonDateParse(raw: String): Double {
    val s = raw.trim()
    var i = 0
    fun digits(n: Int): Int? {
        if (i + n > s.length) return null
        var v = 0
        for (k in 0 until n) {
            val c = s[i + k]
            if (c !in '0'..'9') return null
            v = v * 10 + (c - '0')
        }
        i += n
        return v
    }
    fun take(c: Char): Boolean = if (i < s.length && s[i] == c) { i++; true } else false
    val year: Int
    if (i < s.length && (s[i] == '+' || s[i] == '-')) {
        val sign = if (s[i] == '-') -1 else 1
        i++
        year = sign * (digits(6) ?: return Double.NaN)
    } else {
        year = digits(4) ?: return Double.NaN
    }
    var month = 1
    var day = 1
    if (take('-')) {
        month = digits(2)?.takeIf { it in 1..12 } ?: return Double.NaN
        if (take('-')) day = digits(2)?.takeIf { it in 1..31 } ?: return Double.NaN
    }
    var hour = 0
    var minute = 0
    var second = 0
    var milli = 0
    var hasTime = false
    var offset: Int? = null
    if (i < s.length && (s[i] == 'T' || s[i] == 't' || s[i] == ' ')) {
        i++
        hasTime = true
        hour = digits(2) ?: return Double.NaN
        if (!take(':')) return Double.NaN
        minute = digits(2) ?: return Double.NaN
        if (take(':')) {
            second = digits(2) ?: return Double.NaN
            if (take('.') || take(',')) {
                var frac = 0
                var count = 0
                while (i < s.length && s[i] in '0'..'9') {
                    if (count < 3) frac = frac * 10 + (s[i] - '0')
                    count++
                    i++
                }
                if (count == 0) return Double.NaN
                while (count < 3) { frac *= 10; count++ }
                milli = frac
            }
        }
        if (!(hour < 24 || (hour == 24 && minute == 0 && second == 0 && milli == 0))) return Double.NaN
        if (minute >= 60 || second >= 60) return Double.NaN
        if (take('Z') || take('z')) {
            offset = 0
        } else if (i < s.length && (s[i] == '+' || s[i] == '-')) {
            val sg = if (s[i] == '-') -1 else 1
            i++
            val oh = digits(2) ?: return Double.NaN
            take(':')
            val om = digits(2) ?: return Double.NaN
            offset = sg * (oh * 60 + om)
        }
    }
    if (i != s.length) return Double.NaN
    if (offset != null) {
        val asUtc = pyreonDateCompose(true, year.toLong(), (month - 1).toLong(), day.toLong(), hour.toLong(), minute.toLong(), second.toLong(), milli.toDouble())
        return pyreonDateFrom(asUtc - offset * 60_000.0)
    }
    return pyreonDateCompose(!hasTime, year.toLong(), (month - 1).toLong(), day.toLong(), hour.toLong(), minute.toLong(), second.toLong(), milli.toDouble())
}
