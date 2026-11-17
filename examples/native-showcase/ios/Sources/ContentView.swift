import SwiftUI

// The host's only job: fill the screen with the app's page colour, pin the
// generated view to the top, and tint the system controls (switch, caret)
// with the app's accent, the way any SwiftUI app sets its AccentColor.
// Both follow the system light/dark setting, as TodayApp itself does.
struct ContentView: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        ZStack(alignment: .top) {
            (scheme == .dark
                ? Color(.sRGB, red: 0.039, green: 0.039, blue: 0.055, opacity: 1)   // #0A0A0E
                : Color(.sRGB, red: 0.957, green: 0.937, blue: 0.902, opacity: 1))  // #F4EFE6
                .ignoresSafeArea()
            TodayApp()
        }
        .tint(scheme == .dark
            ? Color(.sRGB, red: 1.000, green: 0.369, blue: 0.102, opacity: 1)       // #FF5E1A
            : Color(.sRGB, red: 0.659, green: 0.220, blue: 0.039, opacity: 1))      // #A8380A
    }
}
