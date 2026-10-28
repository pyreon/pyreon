// <CanvasPath d> on iOS goes through this parser (Compose has androidx's
// PathParser, the web has the browser's), so it is the one implementation
// whose agreement with SVG has to be checked by hand.

import SwiftUI
import XCTest
@testable import PyreonRuntime

final class PyreonCanvasTests: XCTestCase {
    private func box(_ d: String) -> CGRect { PyreonCanvasPath.svg(d).boundingRect }
    private func assertRect(_ r: CGRect, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat,
                            file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(r.minX, x, accuracy: 0.01, file: file, line: line)
        XCTAssertEqual(r.minY, y, accuracy: 0.01, file: file, line: line)
        XCTAssertEqual(r.width, w, accuracy: 0.01, file: file, line: line)
        XCTAssertEqual(r.height, h, accuracy: 0.01, file: file, line: line)
    }

    func testAbsoluteLinesAndClose() {
        assertRect(box("M10 10 L200 10 L200 200 Z"), 10, 10, 190, 190)
    }

    func testRelativeAndShorthandLines() {
        // h/v relative to the current point; the result is a 30×20 box at (5,5).
        assertRect(box("m5 5 h30 v20 h-30 z"), 5, 5, 30, 20)
        assertRect(box("M5 5 H35 V25 H5 Z"), 5, 5, 30, 20)
    }

    func testImplicitLinetoAfterMoveto() {
        // Pairs after M are linetos (relative after m).
        assertRect(box("M0 0 10 0 10 10"), 0, 0, 10, 10)
        assertRect(box("m1 1 10 0 0 10"), 1, 1, 10, 10)
    }

    func testCompactNumberSyntax() {
        // "1.5.5" is 1.5 then .5; "-" starts a new number; exponents parse.
        assertRect(box("M1.5.5L10-2"), 1.5, -2, 8.5, 2.5)
        assertRect(box("M0,0L1e1,2E1"), 0, 0, 10, 20)
    }

    func testCubicAndSmoothCubic() {
        // A symmetric S-curve stays inside its control hull and reaches both ends.
        let r = box("M0 0 C0 10 10 10 10 0 S20 -10 20 0")
        XCTAssertEqual(r.minX, 0, accuracy: 0.01)
        XCTAssertEqual(r.maxX, 20, accuracy: 0.01)
        XCTAssertEqual(r.maxY, 7.5, accuracy: 0.01) // cubic peak at 3/4 of the control height
        XCTAssertEqual(r.minY, -7.5, accuracy: 0.01) // the reflected control point
    }

    func testQuadraticAndSmoothQuadratic() {
        let r = box("M0 0 Q5 10 10 0 T20 0")
        XCTAssertEqual(r.maxY, 5, accuracy: 0.01) // quadratic peak at half the control height
        XCTAssertEqual(r.minY, -5, accuracy: 0.01)
    }

    func testArcSemicircle() {
        // A half circle of radius 10 from (0,10) to (20,10), sweeping upward.
        assertRect(box("M0 10 A10 10 0 0 1 20 10"), 0, 0, 20, 10)
        // The other sweep goes downward.
        assertRect(box("M0 10 A10 10 0 0 0 20 10"), 0, 10, 20, 10)
    }

    func testArcFlagsWithoutSeparators() {
        assertRect(box("M0 10a10 10 0 0120 0"), 0, 0, 20, 10)
    }

    func testArcRadiiScaledUpWhenTooSmall() {
        // Radius 1 cannot span 20 units; SVG scales it to 10 — the same half circle.
        assertRect(box("M0 10 A1 1 0 0 1 20 10"), 0, 0, 20, 10)
    }

    func testMalformedInputKeepsWhatParsed() {
        assertRect(box("M0 0 L10 10 L"), 0, 0, 10, 10)
        XCTAssertTrue(PyreonCanvasPath.svg("garbage").isEmpty)
        XCTAssertTrue(PyreonCanvasPath.svg("").isEmpty)
    }

    func testShapeBuilders() {
        assertRect(PyreonCanvasPath.rect(x: 1, y: 2, width: 30, height: 40, radius: 0).boundingRect, 1, 2, 30, 40)
        assertRect(PyreonCanvasPath.rect(x: 0, y: 0, width: 10, height: 10, radius: 99).boundingRect, 0, 0, 10, 10)
        assertRect(PyreonCanvasPath.circle(cx: 5, cy: 5, r: 5).boundingRect, 0, 0, 10, 10)
        assertRect(PyreonCanvasPath.line(x1: 0, y1: 0, x2: 4, y2: 3).boundingRect, 0, 0, 4, 3)
    }
}
