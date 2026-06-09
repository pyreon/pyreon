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
            ContentView()
        }
    }
}
