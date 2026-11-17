// AdaptiveUITests — the compact half of ADP-3 on the iPhone Simulator: a
// two-element responsive array (`style={{ padding: [8, 24] }}`) resolves to
// its compact entry, and the size-class Stack↔Inline swap stacks. The Android
// twin, `AdaptiveInstrumentedTest.kt`, flips the class live on one device and
// asserts both halves; the page is `src/AdaptivePage.tsx`.

import XCTest

private extension XCUIElement {
    /// `waitForExistence(timeout:)` without its one-second first poll (see
    /// `PyreonRouterDemoUITests.swift`).
    func waitToExist(timeout: TimeInterval) -> Bool {
        if exists { return true }
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            if exists { return true }
        }
        return false
    }
}

final class AdaptiveUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_responsiveArrayAndSwapResolveCompactOnPhone() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://adaptive")))
        XCTAssertTrue(app.otherElements["adaptive-page"].firstMatch.waitToExist(timeout: 20), "the adaptive page did not open")
        XCTAssertEqual(app.staticTexts["adp-class"].firstMatch.label, "Class: compact")

        // The responsive array: the child's inset from the page's content
        // edge (a sibling Text there) is the compact entry, 8pt. 24 would be
        // the regular entry on an iPhone; 0 the array dropped. Not measured
        // against the box: its accessibility frame is the content inside the
        // padding, which reads 0 whatever the padding is.
        let edge = app.staticTexts["adp-class"].firstMatch
        let child = app.staticTexts["adp-pad-child"].firstMatch
        XCTAssertTrue(child.waitToExist(timeout: 5), "adp-pad-child missing")
        let inset = child.frame.minX - edge.frame.minX
        XCTAssertEqual(inset, 8, accuracy: 1.5, "the responsive padding resolved to a \(inset)pt inset, not the compact 8pt")

        // The swap: compact is the Stack branch, B below A on the same column.
        XCTAssertTrue(app.otherElements["adp-swap-stack"].firstMatch.exists, "the compact branch (Stack) did not render")
        XCTAssertFalse(app.otherElements["adp-swap-inline"].firstMatch.exists, "the regular branch (Inline) rendered on an iPhone")
        let a = app.staticTexts["adp-swap-a"].firstMatch.frame
        let b = app.staticTexts["adp-swap-b"].firstMatch.frame
        XCTAssertGreaterThan(b.minY, a.maxY, "B is not below A (A \(a), B \(b))")
        XCTAssertEqual(b.minX, a.minX, accuracy: 1, "B is not in A's column (A \(a), B \(b))")
        app.terminate()
    }
}
