// Root view for the iOS router-demo host. Bootstraps the
// Pyreon-emitted RouterApp view as its body content.
//
// `RouterApp` is provided by the compiler-emitted Swift in
// `generated/RouterApp.swift` (produced by `scripts/build.sh`
// running `pyreon-native build --target=ios`). The emit produces:
//   - struct HomePage / AboutPage / UserPage : View
//   - struct RouterApp : View (PyreonRouter + RouterProvider +
//     .navigationDestination block dispatching paths to the
//     matched view)
// All from the SHARED `src/RouterApp.tsx` source — same .tsx that
// the web sibling at `native-router-demo-web/` imports verbatim.

import SwiftUI

struct ContentView: View {
    var body: some View {
        // `-pyreonTabsDemo` launches the tab-bar router demo (#4060) — a second
        // root from the same RouterApp.tsx, so the per-tab-stack UITest runs
        // without reshaping RouterApp's screens.
        if ProcessInfo.processInfo.arguments.contains("-pyreonTabsDemo") {
            TabsApp()
        } else {
            RouterApp()
        }
    }
}
