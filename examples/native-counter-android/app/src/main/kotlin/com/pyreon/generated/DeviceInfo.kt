// An APP-provided native module — the Android half of the FFI escape hatch.
//
// Nothing here is framework-owned: `@pyreon/native-compiler` does not know
// this class exists. The shared `Counter.tsx` declares
// `useNativeModule<{ platformName(): string }>('DeviceInfo')`, PMTC lowers it
// to `val device = remember { DeviceInfo(deviceCtx) }`, and member calls pass
// through verbatim — so THIS file is what kotlinc type-checks the call
// against. Adding a platform capability is an app-level change now, not a
// framework PR.
//
// The contract PMTC's Compose emit relies on:
//   - the class name matches the string passed to `useNativeModule`
//   - it takes a SINGLE `Context` constructor parameter (the emit hoists
//     `LocalContext.current` into a sibling val and injects it — the same
//     shape the built-in clipboard / share / linking services use). A module
//     that does not need a Context simply ignores the parameter.
//   - method names/arities match what the shared source calls
//
// PACKAGE NOTE — the one extra step the FFI needs on Android. The emit
// references `DeviceInfo` UNQUALIFIED, so the class must resolve from the
// GENERATED file's package: the `--kotlin-package` value, `com.pyreon.generated`
// here (set in `scripts/build.sh`). So a native-module class is declared in
// that package and lives at the matching path — which is why this file sits
// beside the emitted `Counter.kt` and why `.gitignore` scopes the ignore to
// that emitted FILE rather than this whole directory (hand-written app code
// shares the package; only the compiler's output is disposable).
//
// Swift needs no equivalent step — one module, one namespace — which is why
// `ios/DeviceInfo.swift` carries no such note. A future `--kotlin-app-package`
// flag could emit an explicit import and let native modules live in the app's
// own package instead; same-package is the documented v1 contract.

package com.pyreon.generated

import android.content.Context

class DeviceInfo(@Suppress("UNUSED_PARAMETER") private val context: Context) {
  /** Deliberately DIFFERENTIATING across targets — iOS answers "iOS" and this
   *  answers "Android", so the device test proves the real platform class ran
   *  rather than a value baked in by the compiler. */
  fun platformName(): String = "Android"
}
