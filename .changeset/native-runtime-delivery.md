---
'@pyreon/create-multiplatform': patch
---

create-multiplatform: scaffolded native apps now build + launch end-to-end. A local proof (Android emulator + iOS Simulator) of a scaffolded app surfaced eight scaffold bugs that compile-only validation never caught — all fixed so a fresh `create-multiplatform` app builds and runs on both targets:

- The web entry (`entry-web.tsx`, which `mount`s against the DOM) was compiled to native code, emitting `document.getElementById(...)` into Swift/Kotlin (can't compile). The native build now skips any `.tsx` importing a web-only runtime (`@pyreon/runtime-dom` / `@pyreon/runtime-server`).
- Android: `build-android.sh` now passes `--kotlin-package` so the emit lands in the FQN `MainActivity` imports; the root Gradle file declares the `kotlin("plugin.serialization")` version; `MainActivity` extends `ComponentActivity` (Compose `setContent` receiver) instead of plain `Activity`.
- iOS: `project.yml` SPM-package + source + Info paths are now relative to `ios/` (where the spec lives); the `@main` entry moved to `Main.swift` (the emitted component is `generated/App.swift` — two `App.swift` files collide); the entry conforms to `SwiftUI.App` (the emitted `struct App: View` shadows the bare `App` protocol).
- The scaffold now wires the four `@pyreon/native-*` runtime packages as SPM (iOS) / Gradle `srcDir` (Android) dependencies so the emitted `import PyreonRuntime` / `com.pyreon.runtime.*` resolve.
