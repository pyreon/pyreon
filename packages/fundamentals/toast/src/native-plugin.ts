/**
 * `@pyreon/toast/native-plugin` — how the imperative `toast(...)` API and `<Toaster />` cross to SwiftUI and
 * Compose.
 *
 * The package OWNS its native lowering: `toast("x")` and the `success` / `error` / `warning` / `info` /
 * `loading` presets lower to the process-global `PyreonToast` queue, `<Toaster />` to a native overlay over
 * its reactive list, and the compile-gate stubs for that runtime type ship here. `@pyreon/native-cli`
 * discovers it from `package.json` → `pyreon.native.plugin` when a source file imports `@pyreon/toast`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { toastPlugin, toastPlugin as default } from './native-plugin/plugin'
export { toastStubs } from './native-plugin/stubs'
