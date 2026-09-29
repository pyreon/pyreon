---
'@pyreon/hooks': patch
'@pyreon/native-compiler': patch
---

`useScreenOrientation()` / `useSafeArea()` compiled to `AndroidOrientationProbe(ctx)` / `AndroidSafeAreaProbe(ctx)` (Kotlin) and `UIKitOrientationProbe()` / `UIKitSafeAreaProbe()` (Swift), but no runtime file defined any of the four — they existed only in the validation stubs, so any app using either hook failed to build against the real SDK while every stub gate stayed green. The real probes now ship in `@pyreon/hooks` native (`PyreonSafeAreaAndroid.kt`, `PyreonSafeAreaUIKit.swift`): read-through, dp/points, orientation angle matching `screen.orientation.angle`, and on Android reactive via a `RememberObserver` (config callback + layout listener) so no emit change was needed. The Kotlin stubs now mirror the real constructor type. `emitted-runtime-types-exist` now also checks `Android*`/`UIKit*` probe names; nine other phantom probes it surfaced are pinned in a ratchet list that can only shrink.
