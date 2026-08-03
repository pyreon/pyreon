---
'@pyreon/native-runtime-kotlin': patch
---

Move OkHttp WebSocket callbacks onto the main thread before they write Compose state.

OkHttp delivers every `WebSocketListener` callback on its own reader thread, and those handlers drive `PyreonWebSocket`'s `MutableState` fields (`isConnected` / `messages` / `lastMessage` / `error`). Writing Compose state off the main thread races the UI thread's measure/layout, and Compose throws `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`.

The race needs a callback to land while a frame is still laying out, so the same commit passes on one run and fails on the next — which is why it read as flake. It is not: `native-router-demo-android` calls `useWebSocket`, and its device gate fails on `tenThousandRowListIsLazyAndDeepRowReachable` (the frame most likely to still be laying out) with exactly that error.

Every callback now hops to the main looper. `rememberPyreonGeolocation` already passed `Looper.getMainLooper()` to `requestLocationUpdates`; this call site had diverged from that pattern. No compile-level gate can catch the class — the emitted Kotlin typechecks clean with the bug present — so the device gate is the proof.
