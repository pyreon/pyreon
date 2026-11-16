// @main entry point for the Pyreon iOS tasks showcase.
//
// SwiftUI's `@main App` protocol is the canonical iOS 14+ app entry.
// Mirror of `examples/native-router-demo-ios/ios/App.swift` — same
// minimal SwiftUI shell, different app name + content view.

import SwiftUI

@main
struct PyreonTasksApp: App {
    var body: some Scene {
        WindowGroup {
            // `-PyreonUITestDarkAppearance` (UI tests only) runs the app in dark appearance: it sets the window's
            // style, so SwiftUI's `colorScheme` environment — what `useMediaQuery('(prefers-color-scheme: dark)')`
            // reads — becomes `.dark`. Switching the simulator from inside a test (`XCUIDevice.appearance`) did not
            // reliably reach the app on CI's simulator, which also pins the device to light.
            if ProcessInfo.processInfo.arguments.contains("-PyreonUITestDarkAppearance") {
                ContentView().preferredColorScheme(.dark)
            } else {
                ContentView()
            }
        }
    }
}
