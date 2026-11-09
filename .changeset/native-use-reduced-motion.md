---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

`useReducedMotion()` now lowers to SwiftUI and Compose instead of failing the native build. iOS reads `UIAccessibility.isReduceMotionEnabled` and observes its change notification; Android reads the "Remove animations" (animator duration scale) setting and observes it through a `ContentObserver` delivered on the main looper. Both seed from the current setting, so a screen opened while it is already on does not render motion first.

A bare call of a service container now has a declared value type (`callReadType`), so `'Online: ' + net()` and `'Reduced: ' + motion()` convert the Bool/String correctly instead of emitting a raw `String + Bool` that swiftc rejects. This also fixes the same latent defect for `useOnline`, `useAppState` and `useDocumentVisibility`.

The Kotlin smoke test for `PyreonAppState.visibility` (added with `useDocumentVisibility`) was never called from `main()`, so it type-checked but did not run; it is wired in now and verified to fail when the runtime is wrong.
