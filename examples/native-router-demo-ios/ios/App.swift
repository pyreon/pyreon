// @main entry point for the Pyreon iOS router demo.
//
// SwiftUI's `@main App` protocol is the canonical app entrypoint for
// iOS 14+. Pyreon's compiler-emitted code consumes SwiftUI primitives
// natively; the iOS host code is structurally identical to any
// hand-written SwiftUI app.
//
// Mirror of `examples/native-counter-ios/ios/App.swift` — same
// minimal SwiftUI shell, different app name + content view.

import PyreonRouter
import SwiftUI

@main
struct PyreonRouterDemoApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                // Inbound deep links. `onOpenURL` fires for BOTH shapes: a cold
                // launch (the app was started by the URL) and a warm hand-off
                // (it was already running). PyreonDeepLink absorbs the
                // difference — a link with no router yet is held and consumed
                // by the next router's initialPath default; one that arrives
                // later goes straight to the live router.
                //
                // Three lines in the host is the whole integration: the router
                // needs no emit change, because it reads the channel through a
                // default argument.
                .onOpenURL { url in PyreonDeepLink.receive(url) }
        }
    }
}
