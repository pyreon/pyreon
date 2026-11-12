import SwiftUI

// Host shell. The app itself is generated from ../native-showcase/src/TodayApp.tsx
// (the same file the web and Android hosts build) into generated/TodayApp.swift.
@main
struct PyreonShowcaseApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
