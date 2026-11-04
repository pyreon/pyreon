package com.pyreon.runtime

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.ResolverStyle

/** The three date kinds of `<Field kind>`. */
enum class PyreonDateFieldKind { Date, Time, DateTime }

/**
 * The `<Field kind="date" | "time" | "datetime">` value contract — the web's
 * own zone-free wall-clock strings (`<input type="date" | "time" |
 * "datetime-local">`): `YYYY-MM-DD`, `HH:mm` (24-hour), `YYYY-MM-DDTHH:mm`.
 *
 * Kept free of Android and Compose so it RUNS on the JVM here
 * (`PyreonDateValueTest`), where `PyreonDateField` — the Material 3 picker
 * built on it — can only be typechecked. STRICT parsing: a value the web
 * would not accept (`2026-02-30`, `25:00`) is "no value", not a guess.
 *
 * Material 3's date picker speaks UTC-MIDNIGHT milliseconds for a calendar
 * day; [dayToPickerMillis] / [pickerMillisToDay] are the only crossings, so a
 * day can never shift by the device's UTC offset on the way in or out.
 */
object PyreonDateValue {
    private val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT)
    private val TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT)
    private val DATETIME: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm").withResolverStyle(ResolverStyle.STRICT)

    fun parseDate(value: String): LocalDate? = try { LocalDate.parse(value, DATE) } catch (_: DateTimeParseException) { null }
    fun parseTime(value: String): LocalTime? = try { LocalTime.parse(value, TIME) } catch (_: DateTimeParseException) { null }
    fun parseDateTime(value: String): LocalDateTime? =
        try { LocalDateTime.parse(value, DATETIME) } catch (_: DateTimeParseException) { null }

    fun format(date: LocalDate): String = date.format(DATE)
    fun format(time: LocalTime): String = time.format(TIME)
    fun format(dateTime: LocalDateTime): String = dateTime.format(DATETIME)

    /** Is [value] a valid value of [kind] (non-empty, strictly in format)? */
    fun isValid(value: String, kind: PyreonDateFieldKind): Boolean = when (kind) {
        PyreonDateFieldKind.Date -> parseDate(value) != null
        PyreonDateFieldKind.Time -> parseTime(value) != null
        PyreonDateFieldKind.DateTime -> parseDateTime(value) != null
    }

    /** A calendar day as the UTC-midnight milliseconds Material 3's picker uses. */
    fun dayToPickerMillis(day: LocalDate): Long = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

    /** Material 3's UTC-midnight milliseconds back to the calendar day the user tapped. */
    fun pickerMillisToDay(millis: Long): LocalDate =
        java.time.Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()

    /**
     * Clamp [value] into `[min, max]` — string comparison is order-correct for
     * these zero-padded formats. A bound that is not a valid value is ignored,
     * as a browser ignores a malformed `min`.
     */
    fun clamp(value: String, kind: PyreonDateFieldKind, min: String?, max: String?): String {
        var out = value
        if (min != null && isValid(min, kind) && out < min) out = min
        if (max != null && isValid(max, kind) && out > max) out = max
        return out
    }
}
