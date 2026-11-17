// NotificationDeliveryUITests — the iOS half of API-1: a local notification
// posted with `useNotifications().notify(title, body)` is DELIVERED and SHOWN,
// asserted in SpringBoard (the banner) and in Notification Center. The Android
// twin is `PlatformIntentsInstrumentedTest`, which reads `activeNotifications`.
//
// What this caught: the notification fires one second after the tap, while
// the app is still in the foreground, and without a notification-center
// delegate iOS presents NOTHING for a foreground app and does not keep it in
// Notification Center (the system log reads `shouldPresentAlert: NO`, `Saving
// notification: NO`). Android posts it and the web shows it. The runtime now
// installs a foreground presenter when the app has no delegate of its own.

import XCTest

private extension XCUIElement {
    /// `waitForExistence(timeout:)` without its one-second first poll (see
    /// `PyreonCounterUITests.swift`).
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

final class NotificationDeliveryUITests: XCTestCase {
    private let body = "A local notification"

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func bodyText(in springboard: XCUIApplication) -> XCUIElement {
        springboard.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", body)).firstMatch
    }

    func test_notifyIsDeliveredAndShownWhileTheAppIsInTheForeground() throws {
        let app = XCUIApplication()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        app.launch()
        let notify = app.buttons["Notify"]
        XCTAssertTrue(notify.waitToExist(timeout: 30), "Notify button did not appear")

        // A banner left by an earlier test must be gone first, or it would
        // satisfy the assertion below without this tap delivering anything.
        let deadline = Date().addingTimeInterval(10)
        while bodyText(in: springboard).exists && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTAssertFalse(bodyText(in: springboard).exists, "a banner from an earlier notification never went away")

        notify.tap()
        // First use asks for authorization; a later run on the same device does not.
        let allow = springboard.buttons["Allow"]
        if allow.waitToExist(timeout: 5) { allow.tap() }

        // Delivered and presented while the app is in the foreground.
        XCTAssertTrue(
            bodyText(in: springboard).waitToExist(timeout: 10),
            "no banner showed '\(body)' within 10s of Notify — the notification was not presented")
        XCTAssertEqual(app.state, .runningForeground, "the app left the foreground, so this did not test foreground delivery")

        // And kept in Notification Center.
        // Wait for the banner to leave first: it carries the same text, and
        // only an entry in the list proves the notification was kept.
        let gone = Date().addingTimeInterval(10)
        while bodyText(in: springboard).exists && Date() < gone {
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCUIDevice.shared.press(.home)
        // Pulling Notification Center down from the top edge is a gesture the
        // home-screen animation can swallow, so it is retried, up to 3 times.
        var listed = false
        for _ in 0..<3 where !listed {
            RunLoop.current.run(until: Date().addingTimeInterval(1))
            springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.001))
                .press(forDuration: 0.2, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.7)))
            listed = bodyText(in: springboard).waitToExist(timeout: 4)
        }
        XCTAssertTrue(listed, "Notification Center does not list '\(body)'")
        // Close Notification Center so the next test starts from a clean screen.
        XCUIDevice.shared.press(.home)
        app.terminate()
    }
}
