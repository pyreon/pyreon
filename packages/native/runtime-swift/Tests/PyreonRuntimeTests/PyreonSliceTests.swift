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

    func testFractionalBoundMatchesJavaScript() {
        XCTAssertEqual(pyreonSliceIndex(2.7), 2)
        XCTAssertEqual(pyreonSliceIndex(-2.7), -2)
        XCTAssertEqual(pyreonSliceIndex(.nan), 0)
        XCTAssertEqual(pyreonSliceIndex(.infinity), Int.max)
        XCTAssertEqual(pyreonSliceIndex(-.infinity), Int.min)
        XCTAssertEqual(pyreonSlice([1, 2, 3, 4, 5], 0, pyreonSliceIndex(5.0 / 2.0)), [1, 2])
    }

    func testSubstringMatchesJavaScript() {
        XCTAssertEqual(pyreonSubstring("hello", 1, 3), "el")
        XCTAssertEqual(pyreonSubstring("hi", 0, 10), "hi")
        XCTAssertEqual(pyreonSubstring("hello", 10), "")
        XCTAssertEqual(pyreonSubstring("hello", -2, 2), "he")
        XCTAssertEqual(pyreonSubstring("hello", 3, 1), "el")
    }
}
