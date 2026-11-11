// pyreonNumberString must print exactly what JavaScript's `String(number)`
// prints — Swift's own interpolation prints `7.0`, and every label built from
// arithmetic read differently on iOS than on the web.

import XCTest
@testable import PyreonRuntime

final class PyreonNumberTests: XCTestCase {
    func testWholeDoublesPrintAsIntegers() {
        XCTAssertEqual(pyreonNumberString(7.0), "7")
        XCTAssertEqual(pyreonNumberString(-3.0), "-3")
        XCTAssertEqual(pyreonNumberString(-0.0), "0")
        XCTAssertEqual(pyreonNumberString(1709251200000.0), "1709251200000")
        XCTAssertEqual(pyreonNumberString(1e20), "100000000000000000000")
    }

    func testFractionsAndNonFinite() {
        XCTAssertEqual(pyreonNumberString(1.5), "1.5")
        XCTAssertEqual(pyreonNumberString(0.1), "0.1")
        XCTAssertEqual(pyreonNumberString(Double.nan), "NaN")
        XCTAssertEqual(pyreonNumberString(Double.infinity), "Infinity")
        XCTAssertEqual(pyreonNumberString(-Double.infinity), "-Infinity")
        XCTAssertEqual(pyreonNumberString(42), "42")
    }

    // pyreonInt is Kotlin's Double.toLong(): the Android emit stores the same value, and neither target traps.
    func testIntConversionNeverTraps() {
        XCTAssertEqual(pyreonInt(7.0), 7)
        XCTAssertEqual(pyreonInt(-7.9), -7)
        XCTAssertEqual(pyreonInt(1709251200000.0), 1709251200000)
        XCTAssertEqual(pyreonInt(Double.nan), 0)
        XCTAssertEqual(pyreonInt(Double.infinity), Int.max)
        XCTAssertEqual(pyreonInt(-Double.infinity), Int.min)
        XCTAssertEqual(pyreonInt(1e300), Int.max)
        XCTAssertEqual(pyreonInt(9_223_372_036_854_775_808.0), Int.max)
        XCTAssertEqual(pyreonInt(-9_223_372_036_854_775_808.0), Int.min)
    }

    // pyreonRound is JavaScript's Math.round; the Android emit calls the same function (#4258).
    func testRoundIsJavaScripts() {
        XCTAssertEqual(pyreonRound(2.5), 3)
        XCTAssertEqual(pyreonRound(-2.5), -2)
        XCTAssertEqual(pyreonRound(0.49999999999999994), 0)
        XCTAssertEqual(pyreonRound(4_503_599_627_370_497.0), 4_503_599_627_370_497.0)
        XCTAssertEqual(pyreonRound(1e300), 1e300)
        XCTAssertEqual(pyreonRound(-0.4).sign, .minus)
        XCTAssertTrue(pyreonRound(Double.nan).isNaN)
        XCTAssertEqual(pyreonRound(Double.infinity), Double.infinity)
        XCTAssertEqual(pyreonInt(pyreonRound(Double.nan) + 1), 0)
    }

    func testChartCategoriesAndDates() {
        XCTAssertEqual(pyreonChartString(2024), "2024")
        XCTAssertEqual(pyreonChartString(2024.0), "2024")
        XCTAssertEqual(pyreonChartString("Jan"), "Jan")
        XCTAssertEqual(plain(7.0), "7")
        XCTAssertEqual(formatDate(1709802304000.0, "D MMM YYYY [at] HH:mm"), "7 Mar 2024 at 09:05")
    }
}
