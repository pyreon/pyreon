import Foundation

// JavaScript's `Date`, for emitted code. Natively a date IS its epoch milliseconds (a `Double`, NaN for an invalid
// date) — the representation the `Intl` formatters already take — so `new Date(x)` lowers to a number and each method
// to one of these functions. The getters read the DEVICE time zone (the web's local time) or UTC, with JavaScript's
// conventions: a 0-based month, Sunday = 0, every field NaN for an invalid date.
//
// Parsing accepts the ECMAScript date-time string format (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, then
// `THH:mm[:ss[.sss]]` and an optional `Z` / `±HH:mm`; a space may stand for the `T`). A date-only form is UTC and a
// date-time form without an offset is LOCAL, as the specification says. Other strings — the formats only some
// browsers guess at — are NaN. Locked against the web's own answers by the native-compiler `native-date.test.ts`,
// which executes these under a fixed time zone.

private let pyreonGregorianUTC: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()

private func pyreonCalendar(_ utc: Bool) -> Calendar {
    if utc { return pyreonGregorianUTC }
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    return c
}

// Proleptic Gregorian day arithmetic (Howard Hinnant's algorithms), as ECMAScript specifies. Foundation's gregorian
// Calendar switches to the Julian calendar before October 1582, which put early dates a day or more off the web's.
private func pyreonDaysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
    let y = m <= 2 ? y0 - 1 : y0
    let era = (y >= 0 ? y : y - 399) / 400
    let yoe = y - era * 400
    let doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
}

private func pyreonCivilFromDays(_ z0: Int) -> (year: Int, month: Int, day: Int) {
    let z = z0 + 719_468
    let era = (z >= 0 ? z : z - 146_096) / 146_097
    let doe = z - era * 146_097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let d = doy - (153 * mp + 2) / 5 + 1
    let m = mp + (mp < 10 ? 3 : -9)
    return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
}

/// `new Date(text)` / `Date.parse(text)`.
public func pyreonDateFrom(_ text: String) -> Double { pyreonDateParse(text) }
/// `new Date(ms)`: the milliseconds, truncated toward zero as the web's TimeClip does.
public func pyreonDateFrom(_ ms: Double) -> Double { ms.isFinite && abs(ms) <= 8.64e15 ? ms.rounded(.towardZero) + 0 : .nan }
public func pyreonDateFrom(_ ms: Int) -> Double { pyreonDateFrom(Double(ms)) }

/// `d.getFullYear()` … `d.getMilliseconds()` and their `getUTC…` twins. `field`: 0 year, 1 month (0-based),
/// 2 day of month, 3 weekday (Sunday = 0), 4 hours, 5 minutes, 6 seconds, 7 milliseconds.
public func pyreonDateGet(_ ms: Double, _ field: Int, _ utc: Bool) -> Double {
    guard ms.isFinite else { return .nan }
    // Local time is UTC shifted by the zone's offset AT THAT INSTANT.
    let offset = utc ? 0 : Double(TimeZone.current.secondsFromGMT(for: Date(timeIntervalSince1970: ms / 1000))) * 1000
    let t = ms + offset
    let days = (t / 86_400_000).rounded(.down)
    let inDay = t - days * 86_400_000
    let civil = pyreonCivilFromDays(Int(days))
    switch field {
    case 0: return Double(civil.year)
    case 1: return Double(civil.month - 1)
    case 2: return Double(civil.day)
    case 3: return Double(((Int(days) + 4) % 7 + 7) % 7)
    case 4: return (inDay / 3_600_000).rounded(.down)
    case 5: return (inDay.truncatingRemainder(dividingBy: 3_600_000) / 60_000).rounded(.down)
    case 6: return (inDay.truncatingRemainder(dividingBy: 60_000) / 1000).rounded(.down)
    default: return inDay.truncatingRemainder(dividingBy: 1000)
    }
}
public func pyreonDateGet(_ ms: Int, _ field: Int, _ utc: Bool) -> Double { pyreonDateGet(Double(ms), field, utc) }

/// `d.getTimezoneOffset()`: minutes from local time to UTC at that instant (positive west of Greenwich).
public func pyreonDateTimezoneOffset(_ ms: Double) -> Double {
    guard ms.isFinite else { return .nan }
    return -Double(TimeZone.current.secondsFromGMT(for: Date(timeIntervalSince1970: ms / 1000))) / 60
}
public func pyreonDateTimezoneOffset(_ ms: Int) -> Double { pyreonDateTimezoneOffset(Double(ms)) }

/// `d.toISOString()`: `YYYY-MM-DDTHH:mm:ss.sssZ` in UTC (a six-digit signed year outside 0…9999). The web throws a
/// RangeError for an invalid date; natively that reads `Invalid Date`, the web's `String(d)` for one.
public func pyreonDateISO(_ ms: Double) -> String {
    guard ms.isFinite else { return "Invalid Date" }
    let y = Int(pyreonDateGet(ms, 0, true))
    let year = (0...9999).contains(y) ? String(format: "%04d", y) : (y < 0 ? "-" : "+") + String(format: "%06d", abs(y))
    return String(
        format: "%@-%02d-%02dT%02d:%02d:%02d.%03dZ",
        year,
        Int(pyreonDateGet(ms, 1, true)) + 1,
        Int(pyreonDateGet(ms, 2, true)),
        Int(pyreonDateGet(ms, 4, true)),
        Int(pyreonDateGet(ms, 5, true)),
        Int(pyreonDateGet(ms, 6, true)),
        Int(pyreonDateGet(ms, 7, true))
    )
}
public func pyreonDateISO(_ ms: Int) -> String { pyreonDateISO(Double(ms)) }

/// `new Date(y, m, d, h, mi, s, ms)` (local) / `Date.UTC(…)`: out-of-range parts roll over (month 12 is January of
/// the next year), and a year 0…99 means 1900…1999, as on the web.
public func pyreonDateMake(_ utc: Bool, _ parts: Double...) -> Double {
    guard parts.allSatisfy({ $0.isFinite }) else { return .nan }
    var p = parts.map { $0.rounded(.towardZero) }
    while p.count < 7 { p.append(p.count == 2 ? 1 : 0) }
    var year = p[0]
    if (0...99).contains(year) { year += 1900 }
    // Normalise the month into the year first: Calendar would do it too, but its era handling differs below year 1.
    let month = p[1]
    year += (month / 12).rounded(.down)
    let m0 = month - (month / 12).rounded(.down) * 12
    // Resolve the calendar DAY in proleptic-Gregorian UTC arithmetic, where every day is 24 h.
    let dayUTC = Double(pyreonDaysFromCivil(Int(year), Int(m0) + 1, 1)) * 86_400_000 + (p[2] - 1) * 86_400_000
    let timeMs = p[3] * 3_600_000 + p[4] * 60_000 + p[5] * 1000 + p[6]
    if utc { return pyreonDateFrom(dayUTC + timeMs) }
    // Local: the wall-clock time on that calendar day, resolved by the zone (a DST day is not 24 h).
    let civil = pyreonCivilFromDays(Int((dayUTC / 86_400_000).rounded(.down)))
    var wall = DateComponents()
    wall.year = civil.year
    wall.month = civil.month
    wall.day = civil.day
    wall.hour = Int(p[3])
    wall.minute = Int(p[4])
    wall.second = Int(p[5])
    guard let local = pyreonCalendar(false).date(from: wall) else { return .nan }
    return pyreonDateFrom(local.timeIntervalSince1970 * 1000 + p[6])
}

private func pyreonDateParse(_ raw: String) -> Double {
    let s = Array(raw.trimmingCharacters(in: .whitespaces))
    var i = 0
    func digits(_ n: Int) -> Int? {
        guard i + n <= s.count else { return nil }
        var v = 0
        for k in 0..<n {
            guard let d = s[i + k].wholeNumberValue, s[i + k].isASCII else { return nil }
            v = v * 10 + d
        }
        i += n
        return v
    }
    func take(_ c: Character) -> Bool {
        if i < s.count, s[i] == c { i += 1; return true }
        return false
    }
    var sign = 1
    var year: Int
    if i < s.count, s[i] == "+" || s[i] == "-" {
        sign = s[i] == "-" ? -1 : 1
        i += 1
        guard let y = digits(6) else { return .nan }
        year = sign * y
    } else {
        guard let y = digits(4) else { return .nan }
        year = y
    }
    var month = 1, day = 1
    if take("-") {
        guard let m = digits(2), (1...12).contains(m) else { return .nan }
        month = m
        if take("-") {
            guard let d = digits(2), (1...31).contains(d) else { return .nan }
            day = d
        }
    }
    var hour = 0, minute = 0, second = 0, milli = 0
    var hasTime = false
    var offset: Int? = nil
    if i < s.count, s[i] == "T" || s[i] == "t" || s[i] == " " {
        i += 1
        hasTime = true
        guard let h = digits(2), take(":"), let mi = digits(2) else { return .nan }
        hour = h
        minute = mi
        if take(":") {
            guard let sec = digits(2) else { return .nan }
            second = sec
            if take(".") || take(",") {
                var frac = 0, count = 0
                while i < s.count, let d = s[i].wholeNumberValue, s[i].isASCII {
                    if count < 3 { frac = frac * 10 + d }
                    count += 1
                    i += 1
                }
                guard count > 0 else { return .nan }
                while count < 3 { frac *= 10; count += 1 }
                milli = frac
            }
        }
        guard hour < 24 || (hour == 24 && minute == 0 && second == 0 && milli == 0) else { return .nan }
        guard minute < 60, second < 60 else { return .nan }
        if take("Z") || take("z") {
            offset = 0
        } else if i < s.count, s[i] == "+" || s[i] == "-" {
            let sg = s[i] == "-" ? -1 : 1
            i += 1
            guard let oh = digits(2) else { return .nan }
            _ = take(":")
            guard let om = digits(2) else { return .nan }
            offset = sg * (oh * 60 + om)
        }
    }
    guard i == s.count else { return .nan }
    // A date-only form is UTC; a date-time form without an offset is local time, resolved by the zone like the
    // constructor's. `pyreonDateMake` maps a year 0…99 to 19xx (the constructor's rule) where the string means the
    // literal year, so such a year is built 400 years later (one Gregorian cycle) and moved back.
    let shift = (0...99).contains(year) ? 400 : 0
    let cycle = Double(shift / 400) * 12_622_780_800_000
    let built = pyreonDateMake(
        offset != nil || !hasTime,
        Double(year + shift), Double(month - 1), Double(day), Double(hour), Double(minute), Double(second), Double(milli)
    )
    guard built.isFinite else { return .nan }
    return pyreonDateFrom(built - cycle - Double(offset ?? 0) * 60_000)
}
