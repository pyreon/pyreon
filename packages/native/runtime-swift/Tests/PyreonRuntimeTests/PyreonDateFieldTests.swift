// PyreonDateValue — the `<Field kind="date" | "time" | "datetime">` value
// contract (#3980): the web's own wall-clock strings, parsed and formatted in
// the device zone with a POSIX locale, so a picked value reads back as exactly
// the string an `<input type="date">` would hold.

import XCTest
@testable import PyreonRuntime

final class PyreonDateFieldTests: XCTestCase {
    func testRoundTripsEachKind() {
        for (value, kind) in [("2026-10-22", PyreonDateFieldKind.date), ("09:05", .time), ("2026-10-22T23:59", .datetime)] {
            let d = PyreonDateValue.parse(value, kind)
            XCTAssertNotNil(d, value)
            XCTAssertEqual(PyreonDateValue.format(d!, kind), value)
        }
    }

    func testEmptyAndMalformedAreNoValue() {
        XCTAssertNil(PyreonDateValue.parse("", .date))
        XCTAssertNil(PyreonDateValue.parse("2026-13-01", .date))
        XCTAssertNil(PyreonDateValue.parse("2026-02-30", .date))
        XCTAssertNil(PyreonDateValue.parse("25:00", .time))
        XCTAssertNil(PyreonDateValue.parse("2026-10-22 09:00", .datetime))
        XCTAssertNil(PyreonDateValue.parse("09:00", .date))
    }

    func testATimeIsAnchoredToToday() {
        let d = PyreonDateValue.parse("07:30", .time)!
        XCTAssertTrue(Calendar.current.isDateInToday(d))
    }

    func testTheWallClockIsTheDeviceZoneNotUTC() {
        // Midnight local: in any zone east of UTC this is the PREVIOUS day in UTC,
        // and the string must still read back as the local day.
        let d = PyreonDateValue.parse("2026-01-01T00:00", .datetime)!
        let local = Calendar.current.dateComponents([.year, .month, .day, .hour], from: d)
        XCTAssertEqual(local.year, 2026)
        XCTAssertEqual(local.day, 1)
        XCTAssertEqual(local.hour, 0)
    }

    func testFormattingIgnoresTheDisplayLocale() {
        // en_US_POSIX: an Arabic or Thai device still writes Latin digits and
        // the Gregorian year the web reads.
        let d = PyreonDateValue.parse("2026-10-22", .date)!
        XCTAssertEqual(PyreonDateValue.format(d, .date), "2026-10-22")
    }
}
