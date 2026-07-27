---
'@pyreon/primitives': minor
---

Add `useNativeModule` / `defineNativeModule` — the FFI escape hatch for user-defined native modules.

Platform services were previously recognised by hard-coded hook name inside the PMTC compiler, so adding any capability the framework did not ship (Bluetooth, ARKit, a payments or analytics SDK) required a framework PR. `<NativeIOS>` / `<NativeAndroid>` did not help: they compile their children through the normal canonical-primitive path, so they BRANCH between platforms rather than hosting raw platform code.

`useNativeModule<T>('Name')` lowers to an instance of a class the app provides — `Name()` on iOS, `Name(context)` on Android — and passes member calls through verbatim, so the platform compiler type-checks the surface. `await mod.method()` composes with the existing async lowering with no extra machinery. On web the same call resolves the implementation registered by `defineNativeModule`, so one source still runs on all three targets; `hasNativeModule` feature-gates without throwing.

The module name must be a string literal at the call site and a valid identifier (it is emitted verbatim as a native type name); anything else is a named compiler warning and the declaration is skipped rather than mis-emitted.

Device-proven on iOS (XCUITest asserts a value produced by an app-provided `DeviceInfo` Swift class) with the Android half asserted in the Compose instrumented test.
