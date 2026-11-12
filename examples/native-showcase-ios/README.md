# native-showcase-ios

iOS host for **Today**: compiles [`../native-showcase/src/TodayApp.tsx`](../native-showcase/src/TodayApp.tsx) to SwiftUI
(`generated/`, gitignored) and builds it with the shared `PyreonRuntime` / `PyreonRouter` packages. The host itself is
`ios/App.swift` and `ios/ContentView.swift` (page colour, top alignment, accent tint). Device test:
`iosUITests/PyreonShowcaseUITests.swift`. Build, run and test commands: [`../native-showcase/README.md`](../native-showcase/README.md).
