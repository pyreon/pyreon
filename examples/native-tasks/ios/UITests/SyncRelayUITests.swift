// SyncRelayUITests — `connectPyreonSync` over the native WebSocket channel
// against a local relay on iOS (OFF-1). The relay is scripts/sync-relay.ts on
// port 8792 (the Simulator shares the host's localhost); it is a peer itself,
// so this test writes on the relay and reads the device, and the other way
// round. The Android twin is SyncRelayInstrumentedTest.kt; the screen is
// src/SyncScreen.tsx.

import XCTest

private extension XCUIElement {
    /// `waitForExistence(timeout:)` without its one-second first poll (see
    /// `PyreonTasksUITests.swift`).
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

final class SyncRelayUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func relay(_ path: String) throws -> String {
        let done = expectation(description: path)
        var body = ""
        URLSession.shared.dataTask(with: try XCTUnwrap(URL(string: "http://localhost:8792\(path)"))) { data, _, _ in
            body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 10)
        return body
    }

    private func waitFor(_ what: String, _ condition: () throws -> Bool) rethrows {
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline {
            if try condition() { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTFail("timed out waiting for \(what)")
    }

    func test_aSyncedValueConvergesOverAWebSocketRelay() throws {
        XCTAssertEqual(try relay("/sync/reset"), "reset", "the relay did not reset")
        let app = XCUIApplication()
        app.launch()
        let username = app.textFields["login-username"].firstMatch
        XCTAssertTrue(username.waitToExist(timeout: 30), "Username field missing")
        username.tap()
        username.typeText("abcde")
        if app.keyboards.count > 0 {
            for label in ["Return", "return", "Done", "done", "Go", "go"] where app.keyboards.buttons[label].exists {
                app.keyboards.buttons[label].tap()
                break
            }
        }
        app.buttons["login-submit"].firstMatch.tap()
        XCTAssertTrue(app.otherElements["tasks-page"].firstMatch.waitToExist(timeout: 20), "Tasks page did not render after login")

        let nav = app.buttons["tasks-sync"].firstMatch
        XCTAssertTrue(nav.waitToExist(timeout: 15), "Sync button missing on tasks page")
        var swipes = 0
        while !nav.isHittable && swipes < 8 {
            app.swipeUp()
            swipes += 1
        }
        nav.tap()
        XCTAssertTrue(app.otherElements["sync-page"].firstMatch.waitToExist(timeout: 15), "Sync page did not render")
        let title = app.staticTexts["sync-title"].firstMatch
        try waitFor("the device to connect to the relay") { try relay("/sync/clients") == "1" }

        // A remote op (written on the relay peer) updates the synced value.
        XCTAssertEqual(try relay("/sync/set?key=relayTitle&value=from-relay"), "ok")
        waitFor("the relay's write to reach the device (\(title.label))") { title.label == "Title: from-relay" }

        // A local write reaches the peer.
        app.buttons["sync-write"].firstMatch.tap()
        waitFor("the device's own write (\(title.label))") { title.label == "Title: from-device" }
        try waitFor("the device's write to reach the relay") { try relay("/sync/get?key=relayTitle") == "from-device" }

        // After disconnect, a relay write no longer arrives.
        app.buttons["sync-disconnect"].firstMatch.tap()
        try waitFor("the device to leave the relay") { try relay("/sync/clients") == "0" }
        XCTAssertEqual(try relay("/sync/set?key=relayTitle&value=after-disconnect"), "ok")
        RunLoop.current.run(until: Date().addingTimeInterval(1.5))
        XCTAssertEqual(title.label, "Title: from-device", "a write after disconnect still arrived")
        app.terminate()
    }
}
