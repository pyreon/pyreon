// SpringUITests — `<Transition easing="spring">` on iOS (ANI-2). The Android
// twin, `SpringInstrumentedTest.kt`, reads the spring's TIMING on the compose
// clock. iOS cannot: SwiftUI drops a leaving view from the accessibility tree
// the moment the `if` gate flips, so the animation is visual only (the
// screenshot-diff instrument is ANI-4). This proves the spring-configured
// transitions build against the real SDK, hide and show again; the curve
// itself is locked by the emit spec and the real-SDK typecheck.

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

final class SpringUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func test_springTransitionsHideAndShow() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://spring")))
        XCTAssertTrue(app.otherElements["spring-page"].firstMatch.waitToExist(timeout: 20), "the spring page did not open")
        let spring = app.staticTexts["spring-box"].firstMatch
        let bouncy = app.staticTexts["bouncy-box"].firstMatch
        XCTAssertTrue(spring.waitToExist(timeout: 5) && bouncy.exists, "the spring boxes did not render")

        app.buttons["spring-toggle"].tap()
        XCTAssertTrue(spring.waitForNonExistence(timeout: 15), "the critically damped spring box never left")
        XCTAssertTrue(bouncy.waitForNonExistence(timeout: 15), "the bouncy spring box never left")

        app.buttons["spring-toggle"].tap()
        XCTAssertTrue(spring.waitToExist(timeout: 15), "the critically damped spring box did not come back")
        XCTAssertTrue(bouncy.waitToExist(timeout: 15), "the bouncy spring box did not come back")
        app.terminate()
    }
}
