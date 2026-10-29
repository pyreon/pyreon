// PyreonDateValue — the `<Field kind="date" | "time" | "datetime">` value
// contract (#3980): the web's own zone-free wall-clock strings.

package com.pyreon.runtime

import java.time.LocalDate
import java.time.ZoneId
import java.util.TimeZone

fun main() {
    // Round trips.
    check(PyreonDateValue.format(PyreonDateValue.parseDate("2026-10-22")!!) == "2026-10-22")
    check(PyreonDateValue.format(PyreonDateValue.parseTime("09:05")!!) == "09:05")
    check(PyreonDateValue.format(PyreonDateValue.parseDateTime("2026-10-22T23:59")!!) == "2026-10-22T23:59")

    // Strict: what the web rejects is no value.
    check(PyreonDateValue.parseDate("") == null)
    check(PyreonDateValue.parseDate("2026-02-30") == null) { "Feb 30 must not resolve to Mar 2" }
    check(PyreonDateValue.parseDate("2026-13-01") == null)
    check(PyreonDateValue.parseTime("25:00") == null)
    check(PyreonDateValue.parseDateTime("2026-10-22 09:00") == null)
    check(!PyreonDateValue.isValid("09:00", PyreonDateFieldKind.Date))

    // The picker's UTC-midnight day survives a device far from UTC — the
    // classic off-by-one where Oct 22 in Tokyo comes back as Oct 21.
    for (zone in listOf("Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati", "UTC")) {
        TimeZone.setDefault(TimeZone.getTimeZone(ZoneId.of(zone)))
        val day = LocalDate.of(2026, 10, 22)
        check(PyreonDateValue.pickerMillisToDay(PyreonDateValue.dayToPickerMillis(day)) == day) { "day shifted in $zone" }
    }

    // Clamp is order-correct and ignores a malformed bound.
    check(PyreonDateValue.clamp("2026-01-01", PyreonDateFieldKind.Date, "2026-03-01", null) == "2026-03-01")
    check(PyreonDateValue.clamp("18:00", PyreonDateFieldKind.Time, null, "17:00") == "17:00")
    check(PyreonDateValue.clamp("10:00", PyreonDateFieldKind.Time, "nonsense", "17:00") == "10:00")

    println("[PyreonDateValueTest] all smoke tests passed")
}
