// @main entry point for the Pyreon iOS router demo.
//
// SwiftUI's `@main App` protocol is the canonical app entrypoint for
// iOS 14+. Pyreon's compiler-emitted code consumes SwiftUI primitives
// natively; the iOS host code is structurally identical to any
// hand-written SwiftUI app.
//
// Mirror of `examples/native-counter-ios/ios/App.swift` — same
// minimal SwiftUI shell, different app name + content view.

import SwiftUI

@main
struct PyreonRouterDemoApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
