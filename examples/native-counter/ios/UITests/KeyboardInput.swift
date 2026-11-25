// Typing into a field waits for keyboard focus first.
//
// `field.tap(); field.typeText(…)` raced the keyboard (#4753): `typeText` sent
// the keys before the tap had made the field first responder, and on a slow CI
// simulator some or all of them were dropped. The login form then submitted a
// short username and the test failed screens later, far from the cause.
//
// `tapAndType` / `typeWhenFocused` wait until the field holds keyboard focus
// with the keyboard up (tapping once more if the first tap did not take), then
// type. Given the value the field must end with, they FAIL the test when it
// reads anything else: focus was confirmed, so a wrong value is a real
// finding (a reset field, a dropped binding), never something to re-type over.
//
// Identical in every example's UITests target. Held by
// `ios-device-test-harness.test.ts`: no suite calls `typeText` straight after
// a `tap()`; it goes through these helpers or waits for focus itself.

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
    /// With `expected`, the field must read exactly that afterwards, or the
    /// test fails with both values. There is no re-type: the only race this
    /// guards (keys sent before focus) is closed by the focus wait.
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
        if current() != expected {
            XCTFail(
                "typed \(text.debugDescription) with keyboard focus; the field reads \(current().debugDescription), expected \(expected.debugDescription)",
                file: file, line: line
            )
        }
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

extension XCUIApplication {
    /// True once the software keyboard is up, false at the deadline. For text
    /// targets that are not an XCUIElement field (a coordinate tap into a
    /// hosted web editor), where element focus cannot be read.
    func waitForKeyboard(timeout: TimeInterval) -> Bool {
        if keyboards.count > 0 { return true }
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            if keyboards.count > 0 { return true }
        }
        return false
    }
}
