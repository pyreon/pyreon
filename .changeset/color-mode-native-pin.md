---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': patch
---

A literal `<ColorModeProvider mode="light" | "dark">` now pins the platform colour scheme for its subtree on iOS and Android. On iOS it adds SwiftUI's `.environment(\.colorScheme, …)`; on Android it provides a `LocalConfiguration` whose night bit is set. A component's own `useColorMode()` below it, and every system control, now agree with the pinned mode, as on the web; before, they read the device's setting. `'system'` and a reactive mode pin nothing. The Android build imports `android.content.res.Configuration` when the emit needs it.
