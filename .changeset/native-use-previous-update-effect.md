---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

`usePrevious()` and `useUpdateEffect()` now lower to SwiftUI and Compose instead of failing the native build.

`usePrevious(() => x)` becomes an optional state that starts empty and takes the old value on every change of `x`, through SwiftUI's two-argument `.onChange(of:)` on iOS and a keyed `LaunchedEffect` plus a remembered snapshot on Android. `useUpdateEffect(() => x, (next, prev) => …)` uses the same observers and, like the web hook, skips the first run. The source must be an expression-body getter and the callback inline; a callback that returns a cleanup function is a named warning that drops the hook, not a silent drop.
