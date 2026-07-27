// Root view for the iOS host. Mounts the Pyreon-emitted app.
//
// `FinanceApp` comes from `generated/FinanceApp.swift`, produced by
// `scripts/build.sh` compiling the SHARED
// `examples/native-finance/src/FinanceApp.tsx`. Unlike the counter (a
// single screen), this is a multi-screen app: `FinanceApp` emits a
// `RouterProvider` wrapping the login / dashboard / detail routes, so the
// host still mounts exactly one view.

import SwiftUI

struct ContentView: View {
    var body: some View {
        FinanceApp()
    }
}
