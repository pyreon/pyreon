// Root view for the iOS TodoMVC host. Bootstraps the Pyreon-emitted
// TodoApp view as its body content.
//
// The `TodoApp` symbol is provided by the compiler-emitted Swift in
// `generated/TodoApp.swift` (produced by `scripts/build.sh` running
// `pyreon-native build`). The emit also produces:
//   - `enum Filter: String { case all, active, completed }`
//   - `struct Todo: Codable { var id; var text; var done }`
//   - `private var nextId: Int = 1`
//   - `struct TodoRow: View { ... }`
// all in the same generated file, so importing the file via the
// xcodegen-resolved file-reference is enough.

import SwiftUI

struct ContentView: View {
    var body: some View {
        TodoApp()
    }
}
