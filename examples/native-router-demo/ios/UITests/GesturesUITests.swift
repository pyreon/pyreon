// GesturesUITests — the gesture vocabulary the motion page does not reach
// (GES-1): vertical swipe, rotate, and the live values a continuous gesture
// reports while it runs. The Android twin is `GesturesInstrumentedTest.kt`;
// the page is `src/GesturesPage.tsx`.
//
// XCUITest cannot pause a synthesized gesture half way, so the live values are
// read from the last 'change' sample (the page writes `Live dx` / `Live scale`
// / `Live deg` only on 'change', never on 'end') and checked against the
// distance the test injected. The Android twin asserts them with the pointer
// still down.

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

final class GesturesUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func openPage() throws -> XCUIApplication {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.otherElements["home-page"].firstMatch.waitToExist(timeout: 30), "Home page did not render")
        XCUIDevice.shared.system.open(try XCTUnwrap(URL(string: "pyreondemo://gestures")))
        XCTAssertTrue(app.otherElements["gestures-page"].firstMatch.waitToExist(timeout: 20), "the gestures page did not open")
        return app
    }

    /// The integer after `prefix` in the static text `id`.
    private func number(_ app: XCUIApplication, _ id: String, _ prefix: String) -> Int? {
        let label = app.staticTexts[id].firstMatch.label
        guard label.hasPrefix(prefix) else { return nil }
        return Int(label.dropFirst(prefix.count))
    }

    private func waitForLabel(_ app: XCUIApplication, _ id: String, _ want: String, timeout: TimeInterval = 5) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if app.staticTexts[id].firstMatch.label == want { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return app.staticTexts[id].firstMatch.label == want
    }

    // `<Press onSwipeUp/onSwipeDown>` beside the horizontal pair. 'up'/'down'
    // need the vertical branch with the right sign; a horizontal verdict after
    // a vertical swipe would mean the axis guard is wrong; the final tap proves
    // the drag still leaves taps to `onPress`.
    func test_verticalSwipeFiresUpAndDown() throws {
        let app = try openPage()
        let zone = app.buttons["vswipe-zone"].firstMatch
        XCTAssertTrue(zone.waitToExist(timeout: 10), "swipe zone missing")
        XCTAssertEqual(app.staticTexts["vswipe-status"].firstMatch.label, "VSwipe: none")

        zone.swipeUp()
        XCTAssertTrue(
            waitForLabel(app, "vswipe-status", "VSwipe: up"),
            "an upward swipe did not fire onSwipeUp (\(app.staticTexts["vswipe-status"].firstMatch.label))")
        zone.swipeDown()
        XCTAssertTrue(
            waitForLabel(app, "vswipe-status", "VSwipe: down"),
            "a downward swipe did not fire onSwipeDown (\(app.staticTexts["vswipe-status"].firstMatch.label))")
        zone.swipeLeft()
        XCTAssertTrue(
            waitForLabel(app, "vswipe-status", "VSwipe: left"),
            "the horizontal pair stopped firing beside the vertical one (\(app.staticTexts["vswipe-status"].firstMatch.label))")
        zone.tap()
        XCTAssertTrue(
            waitForLabel(app, "vswipe-status", "VSwipe: tap"),
            "a tap no longer reaches onPress (\(app.staticTexts["vswipe-status"].firstMatch.label))")
        app.terminate()
    }

    // `<Gesture onPan>` live dx: a 0.2 → 0.8 drag across the region moves
    // 0.6 × its width, and the last 'change' sample must say so (to within a
    // few points of input sampling), after more than one change sample.
    func test_panReportsLiveTranslation() throws {
        let app = try openPage()
        let zone = app.otherElements["live-zone"].firstMatch
        XCTAssertTrue(zone.waitToExist(timeout: 10), "live zone missing")
        let expected = Double(zone.frame.width) * 0.6
        zone.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5))
            .press(forDuration: 0.1, thenDragTo: zone.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.5)))
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline && number(app, "live-dx", "Live dx: ") == 0 {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        let dx = try XCTUnwrap(number(app, "live-dx", "Live dx: "), app.staticTexts["live-dx"].firstMatch.label)
        let changes = try XCTUnwrap(number(app, "live-changes", "Changes: "))
        XCTAssertGreaterThan(changes, 1, "the pan delivered \(changes) change samples — the value was not live")
        XCTAssertEqual(Double(dx), expected, accuracy: 12, "live dx \(dx) is not the injected \(expected)pt drag")
        app.terminate()
    }

    // `<Gesture onPinch>` live scale: a spreading two-finger pinch reports a
    // cumulative scale well above 1 while it runs.
    func test_pinchReportsLiveScale() throws {
        let app = try openPage()
        let zone = app.otherElements["live-zone"].firstMatch
        XCTAssertTrue(zone.waitToExist(timeout: 10), "live zone missing")
        zone.pinch(withScale: 2.5, velocity: 1)
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline && number(app, "live-scale", "Live scale: ") == 100 {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        let scale = try XCTUnwrap(number(app, "live-scale", "Live scale: "), app.staticTexts["live-scale"].firstMatch.label)
        XCTAssertGreaterThan(scale, 150, "a 2.5x pinch reported a live scale of \(scale)%")
        app.terminate()
    }

    // `<Gesture onRotate>`: a quarter turn clockwise ends as 'cw' with live
    // degrees near +90, and a counter-clockwise one as 'ccw' near -90 — the
    // sign is the cross-target contract (positive = clockwise).
    func test_rotateReportsDegreesAndDirection() throws {
        let app = try openPage()
        let zone = app.otherElements["live-zone"].firstMatch
        XCTAssertTrue(zone.waitToExist(timeout: 10), "live zone missing")
        XCTAssertEqual(app.staticTexts["rotate-status"].firstMatch.label, "Rotate: none")

        // XCUITest's rotation is in radians, positive = clockwise.
        zone.rotate(CGFloat.pi / 2, withVelocity: 1)
        XCTAssertTrue(
            waitForLabel(app, "rotate-status", "Rotate: cw"),
            "a clockwise rotation did not end as 'cw' (\(app.staticTexts["rotate-status"].firstMatch.label), \(app.staticTexts["live-deg"].firstMatch.label))")
        let cw = try XCTUnwrap(number(app, "live-deg", "Live deg: "))
        XCTAssertGreaterThan(cw, 45, "a quarter turn clockwise reported \(cw) live degrees")

        zone.rotate(-CGFloat.pi / 2, withVelocity: -1)
        XCTAssertTrue(
            waitForLabel(app, "rotate-status", "Rotate: ccw"),
            "a counter-clockwise rotation did not end as 'ccw' (\(app.staticTexts["rotate-status"].firstMatch.label), \(app.staticTexts["live-deg"].firstMatch.label))")
        let ccw = try XCTUnwrap(number(app, "live-deg", "Live deg: "))
        XCTAssertLessThan(ccw, -45, "a quarter turn counter-clockwise reported \(ccw) live degrees")
        app.terminate()
    }
}
