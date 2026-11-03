// PyreonDateTimeFormat / PyreonNumberFormat — the runtime half of the `Intl`
// lowering (#3980). The WEB comparison lives in the compiler's
// `intl-differential.test.ts`, which runs this file's subject against Node and
// JavaScriptCore; these pin the adjustments the runtime makes on top of
// Foundation, each of which a plain `DateFormatter` / `NumberFormatter` gets
// wrong in a way the web does not.

import XCTest
@testable import PyreonRuntime

final class PyreonIntlTests: XCTestCase {
    /// 2026-10-22T08:00:00Z — 10:00 in Berlin.
    let t = 1792656000000.0

    func testDateStylesInAPinnedZone() {
        let f = PyreonDateTimeFormat(locale: "de-DE", dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin")
        XCTAssertEqual(f.format(t), "22.10.2026, 10:00")
        // The same instant in another zone is another wall-clock time.
        let utc = PyreonDateTimeFormat(locale: "de-DE", timeStyle: "short", timeZone: "UTC")
        XCTAssertEqual(utc.format(t), "08:00")
    }

    func testHourFieldFollowsTheRequestedWidth() {
        // `hour: "numeric"` → skeleton `j`. Foundation's template API returns
        // `HH:mm` for German; ICU's MATCH_HOUR_FIELD_LENGTH (which V8 uses)
        // makes it `H:mm`. Without the adjustment this reads "01:00".
        let f = PyreonDateTimeFormat(locale: "de-DE", skeleton: "jmm", timeZone: "Europe/Berlin")
        XCTAssertEqual(f.format(0), "1:00")
        let two = PyreonDateTimeFormat(locale: "de-DE", skeleton: "jjmm", timeZone: "Europe/Berlin")
        XCTAssertEqual(two.format(0), "01:00")
        XCTAssertEqual(pyreonMatchHourWidth("H:mm 'Hour' HH", width: 2), "HH:mm 'Hour' HH")
    }

    func testNarrowNoBreakSpaceBecomesASpaceLikeV8() {
        let f = PyreonDateTimeFormat(locale: "en-US", timeStyle: "short", timeZone: "UTC")
        let s = f.format(t)
        XCTAssertEqual(s, "8:00 AM")
        XCTAssertFalse(s.unicodeScalars.contains("\u{202F}"))
    }

    func testIntegerAndInvalidValues() {
        let f = PyreonDateTimeFormat(locale: "en-US", dateStyle: "short", timeZone: "UTC")
        XCTAssertEqual(f.format(Int(t)), f.format(t))
        XCTAssertEqual(f.format(Double.nan), "Invalid Date")
    }

    func testNumbersRoundHalfAwayFromZeroLikeECMA402() {
        // Foundation's default is banker's rounding: 2.5 → "2".
        let f = PyreonNumberFormat(locale: "en-US", maximumFractionDigits: 0)
        XCTAssertEqual(f.format(2.5), "3")
        XCTAssertEqual(f.format(-2.5), "-3")
        XCTAssertEqual(f.format(3.5), "4")
    }

    func testFractionDigitDefaultsFollowECMA402() {
        // A minimum alone raises the maximum to meet it.
        XCTAssertEqual(PyreonNumberFormat(locale: "en-US", minimumFractionDigits: 4).format(1.5), "1.5000")
        // A maximum below the currency's default minimum lowers the minimum.
        XCTAssertEqual(
            PyreonNumberFormat(locale: "en-US", style: "currency", currency: "USD", maximumFractionDigits: 0).format(1234.5),
            "$1,235"
        )
        XCTAssertEqual(PyreonNumberFormat(locale: "en-US").format(1.23456), "1.235")
    }

    func testCurrencyPercentGroupingAndNaN() {
        XCTAssertEqual(PyreonNumberFormat(locale: "en-US", style: "currency", currency: "USD").format(1234.5), "$1,234.50")
        XCTAssertEqual(PyreonNumberFormat(locale: "en-US", style: "percent").format(0.256), "26%")
        XCTAssertEqual(PyreonNumberFormat(locale: "en-US", useGrouping: false).format(1234567), "1234567")
        XCTAssertEqual(PyreonNumberFormat(locale: "en-US", minimumIntegerDigits: 3).format(7), "007")
        XCTAssertEqual(PyreonNumberFormat(locale: "en-US").format(Double.nan), "NaN")
    }

    func testTheFormatterCacheIsBounded() {
        // A formatter built with a runtime value (a locale, a zone) must not
        // grow the cache without end: leak class C.
        for i in 0..<(pyreonIntlCacheLimit * 3) {
            _ = PyreonNumberFormat(locale: "en-US", minimumIntegerDigits: (i % 21) + 1, useGrouping: i % 2 == 0)
            _ = PyreonDateTimeFormat(locale: "en-US", dateStyle: "short", timeZone: "Etc/GMT+\(i % 12)")
        }
        let counts = _pyreonIntlCacheCounts()
        XCTAssertLessThanOrEqual(counts.number, pyreonIntlCacheLimit)
        XCTAssertLessThanOrEqual(counts.date, pyreonIntlCacheLimit)
    }
}
