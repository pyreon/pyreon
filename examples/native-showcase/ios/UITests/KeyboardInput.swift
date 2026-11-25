// Typing into a field waits for keyboard focus first.
//
// `field.tap(); field.typeText(…)` raced the keyboard (#4753): `typeText` sent
// the keys before the tap had made the field first responder, and on a slow CI
// simulator some or all of them were dropped. The login form then submitted a
// short username and the test failed screens later, far from the cause.
//
// `tapAndType` / `typeWhenFocused` wait until the field holds keyboard focus
// with the keyboard up (tapping once more if the first tap did not take), type,
// and, when given the value the field must end with, re-type once if
// keystrokes were lost.
//
// Identical in every example's UITests target. Held by
// `ios-device-test-harness.test.ts`: no suite calls `typeText` straight after
// tapping the same element.

import XCTest

extension XCUIElement {
    /// Whether this element is the keyboard's first responder.
    var hasKeyboardFocusNow: Bool {
        (value(forKey: "hasKeyboardFocus") as? Bool) ?? false
    }

    /// True once this element holds keyboard focus AND the keyboard is up,
    /// false at the deadline. Polled like `waitToExist`.
    func waitForKeyboardFocus(in app: XCUIApplication, timeout: TimeInterval) -> Bool {
        func focused() -> Bool { hasKeyboardFocusNow && app.keyboards.count > 0 }
        if focused() { return true }
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            if focused() { return true }
        }
        return false
    }

    /// Type into a field that was just tapped, once it has keyboard focus.
    /// With `expected`, check the field's value afterwards and, if keystrokes
    /// were lost, clear it and re-type ONCE.
    func typeWhenFocused(
        _ text: String,
        in app: XCUIApplication,
        expecting expected: String? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        if !waitForKeyboardFocus(in: app, timeout: 5) {
            tap()
            XCTAssertTrue(
                waitForKeyboardFocus(in: app, timeout: 10),
                "field never took keyboard focus (keyboardShown=\(app.keyboards.count > 0)): \(debugDescription)",
                file: file, line: line
            )
        }
        typeText(text)
        guard let expected else { return }
        func current() -> String { (value as? String) ?? "" }
        let deadline = Date().addingTimeInterval(3)
        while current() != expected && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        guard current() != expected else { return }
        // Keystrokes were lost. An empty SwiftUI field reads as its placeholder,
        // so deleting `current().count` characters can only over-delete, which
        // is harmless on an emptied field.
        if !waitForKeyboardFocus(in: app, timeout: 2) { tap() }
        _ = waitForKeyboardFocus(in: app, timeout: 10)
        typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current().count) + expected)
        let retryDeadline = Date().addingTimeInterval(5)
        while current() != expected && Date() < retryDeadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        XCTAssertEqual(current(), expected, "typed text did not land in the field after one re-type", file: file, line: line)
    }

    /// `tap()` then `typeWhenFocused` — how a suite types into a field.
    func tapAndType(
        _ text: String,
        in app: XCUIApplication,
        expecting expected: String? = nil,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        tap()
        typeWhenFocused(text, in: app, expecting: expected, file: file, line: line)
    }
}
