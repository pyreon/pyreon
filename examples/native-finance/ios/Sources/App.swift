// @main entry point for the Pyreon iOS Finance reference.
//
// Structurally identical to any hand-written SwiftUI app — the
// compiler-emitted code consumes SwiftUI primitives natively, so the host
// needs no Pyreon-specific bootstrapping.

import SwiftUI

@main
struct PyreonFinanceApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
