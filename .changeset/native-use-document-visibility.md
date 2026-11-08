---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

`useDocumentVisibility()` now lowers to SwiftUI and Compose instead of failing the native build. It reads a new `visibility` getter on the same lifecycle container `useAppState()` uses: `"hidden"` once the app is backgrounded and `"visible"` otherwise, including while merely inactive, as an unfocused browser tab is still visible. The container is started on appear on iOS and installed by `rememberPyreonAppState()` on Android, so the value no longer sits at its initial state.
