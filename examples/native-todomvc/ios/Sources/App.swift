// @main entry point for the Pyreon iOS TodoMVC reference.
//
// SwiftUI's `@main App` protocol is the canonical app entrypoint for
// iOS 14+. Pyreon's compiler-emitted code consumes SwiftUI primitives
// natively; the iOS host code is structurally identical to any
// hand-written SwiftUI app.

import SwiftUI

@main
struct PyreonTodoMVCApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
