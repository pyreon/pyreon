import SwiftUI

// Host shell. The app itself is generated from ../../src/TodayApp.tsx
// (the same file the web and Android hosts build) into generated/TodayApp.swift.
@main
struct PyreonShowcaseApp: App {
    init() {
        // UI tests launch from a fresh-install state (see UITestAppState.swift).
        UITestAppState.resetIfRequested()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
