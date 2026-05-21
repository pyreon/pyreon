// Root view for the iOS host. Bootstraps the Pyreon-emitted Counter
// view as its body content.
//
// The `Counter` symbol is provided by the compiler-emitted Swift code
// in `generated/Counter.swift` (produced by `scripts/build.sh` running
// `pyreon-native build`). At PR 3 the generated file is a near-empty
// placeholder; PR 4 fills in the real counter implementation.

import SwiftUI

struct ContentView: View {
    var body: some View {
        Counter()
    }
}
