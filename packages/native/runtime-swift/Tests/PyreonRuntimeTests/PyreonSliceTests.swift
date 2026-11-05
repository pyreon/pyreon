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

    // Positions are UTF-16 offsets, as in JavaScript and as `.length` (`utf16.count`) counts them. "👍" is two
    // units and one Character, so a Character-counting helper cuts every one of these at a different place.
    func testStringPositionsAreUtf16Offsets() {
        XCTAssertEqual(pyreonSlice("a👍b", 0, 3), "a👍")
        XCTAssertEqual(pyreonSlice("a👍b", -1), "b")
        XCTAssertEqual(pyreonSubstring("a👍b", 1, 3), "👍")
        XCTAssertEqual(pyreonCharAt("a👍b", 3), "b")
        XCTAssertEqual(pyreonCharAt("a👍b", 9), "")
        XCTAssertEqual(pyreonIndexOf("a👍b", "b"), 3)
        XCTAssertEqual(pyreonIndexOf("a👍b", "b", 4), -1)
        XCTAssertEqual(pyreonIndexOf("abc", ""), 0)
        // Exact code-unit match: canonically-equivalent text is NOT equal, as on the web.
        XCTAssertEqual(pyreonIndexOf("e\u{301}", "\u{e9}"), -1)
        XCTAssertTrue(pyreonStartsWith("a👍b", "b", 3))
        XCTAssertTrue(pyreonEndsWith("a👍b", "👍", 3))
        XCTAssertFalse(pyreonEndsWith("ab", "abc", 2))
    }
}
