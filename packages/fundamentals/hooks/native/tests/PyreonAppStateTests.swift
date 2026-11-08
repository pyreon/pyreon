// Executable checks for PyreonAppState's `visibility` (the value behind
// `useDocumentVisibility()`).
//
// NOT @main: this directory's single @main (PyreonBluetoothTests) calls
// `runAll()`. The phase machine is pure, so no UIKit is needed.

import Foundation

@available(iOS 17.0, macOS 14.0, *)
enum PyreonAppStateTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    static func runAll() {
        visibilityIsHiddenOnlyWhenBackgrounded()
    }

    static func visibilityIsHiddenOnlyWhenBackgrounded() {
        let state = PyreonAppState()
        expect(state.visibility == "visible", "active -> visible")
        state.update("inactive")
        // An unfocused web page is still `visible`; so is an inactive app.
        expect(state.visibility == "visible", "inactive stays visible")
        state.update("background")
        expect(state.visibility == "hidden", "background -> hidden")
        state.update("active")
        expect(state.visibility == "visible", "returning to active -> visible again")
    }
}
