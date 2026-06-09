// Root view for the iOS tasks-showcase host. Bootstraps the
// Pyreon-emitted TasksApp view as its body content.
//
// `TasksApp` is provided by the compiler-emitted Swift in
// `generated/TasksApp.swift` (produced by `scripts/build.sh` running
// `pyreon-native build --target=ios`). The emit produces:
//   - struct LoginPage / TasksListPage / NewTaskPage : View
//   - struct TasksApp : View (PyreonRouter + RouterProvider +
//     navigation block dispatching paths to the matched view, with
//     per-route beforeEnter auth-gate)
//
// All from the SHARED `../native-tasks/src/TasksApp.tsx` source
// (introduced by #1449) — same .tsx the web sibling at
// `native-tasks-web/` (#1456) imports.

import SwiftUI

struct ContentView: View {
    var body: some View {
        TasksApp()
    }
}
