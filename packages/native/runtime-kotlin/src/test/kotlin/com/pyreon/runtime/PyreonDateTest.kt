// PyreonDate must answer what JavaScript's `Date` answers. These checks are UTC-only, so they hold in any time zone;
// the local-time rules (DST gap and overlap, the device zone) are executed against the web's own answers by the
// native-compiler `native-date.test.ts` under a fixed zone.

package com.pyreon.runtime

private fun expect(label: String, got: Any, want: Any) {
    check(got == want) { "$label should be $want, got=$got" }
}

fun main() {
    expect("parse ISO with Z", pyreonDateFrom("2026-03-10T09:30:00Z"), 1773135000000.0)
    expect("parse date-only is UTC", pyreonDateFrom("2026-03-10"), 1773100800000.0)
    expect("parse offset", pyreonDateFrom("2026-06-01T12:00:00.123+02:00"), 1780308000123.0)
    expect("parse garbage is NaN", pyreonDateFrom("abc").isNaN(), true)
    expect("UTC make rolls the month over", pyreonDateMake(true, 2026, 12, 1), pyreonDateFrom("2027-01-01"))
    expect("two-digit year is 19xx", pyreonDateMake(true, 99, 0, 1), 915148800000.0)
    expect("UTC year", pyreonDateGet(1717257600123.0, 0, true), 2024.0)
    expect("UTC month is 0-based", pyreonDateGet(1717257600123.0, 1, true), 5.0)
    expect("UTC weekday (Saturday = 6)", pyreonDateGet(1717257600123.0, 3, true), 6.0)
    expect("milliseconds", pyreonDateGet(1717257600123.0, 7, true), 123.0)
    expect("before 1970", pyreonDateGet(-1.0, 7, true), 999.0)
    expect("ISO", pyreonDateISO(1717257600123.0), "2024-06-01T16:00:00.123Z")
    expect("invalid ISO", pyreonDateISO(Double.NaN), "Invalid Date")
    println("[PyreonDateTest] all smoke tests passed")
}
