// pyreonSlice must return exactly what JavaScript's `slice` returns — in
// particular for a negative bound held in a variable, which is the case
// Swift's own `dropFirst` / `suffix` trap on.

import XCTest
@testable import PyreonRuntime

final class PyreonSliceTests: XCTestCase {
    func testArraySliceMatchesJavaScript() {
        let xs = [1, 2, 3, 4, 5]
        XCTAssertEqual(pyreonSlice(xs, 2), [3, 4, 5])
        XCTAssertEqual(pyreonSlice(xs, -2), [4, 5])
        XCTAssertEqual(pyreonSlice(xs, 1, -1), [2, 3, 4])
        XCTAssertEqual(pyreonSlice(xs, 2, -2), [3])
        XCTAssertEqual(pyreonSlice(xs, -10), [1, 2, 3, 4, 5])
        XCTAssertEqual(pyreonSlice(xs, 10), [])
        XCTAssertEqual(pyreonSlice(xs, 3, 1), [])
        XCTAssertEqual(pyreonSlice(xs, -1, -3), [])
    }

    func testStringSliceMatchesJavaScript() {
        XCTAssertEqual(pyreonSlice("hello", 1, -1), "ell")
        XCTAssertEqual(pyreonSlice("hello", -3), "llo")
    }
}
