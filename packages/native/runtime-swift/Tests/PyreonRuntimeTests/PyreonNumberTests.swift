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

    func testChartCategoriesAndDates() {
        XCTAssertEqual(pyreonChartString(2024), "2024")
        XCTAssertEqual(pyreonChartString(2024.0), "2024")
        XCTAssertEqual(pyreonChartString("Jan"), "Jan")
        XCTAssertEqual(plain(7.0), "7")
        XCTAssertEqual(formatDate(1709802304000.0, "D MMM YYYY [at] HH:mm"), "7 Mar 2024 at 09:05")
    }
}
