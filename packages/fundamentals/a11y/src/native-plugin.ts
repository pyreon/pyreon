/**
 * `@pyreon/a11y/native-plugin` — how the imperative `announce(...)` API crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: `announce("msg", { politeness })` lowers to `PyreonA11y.announce` (a
 * VoiceOver announcement on iOS; a TalkBack live region on Android, hosted by `PyreonA11yHost`, which the plugin
 * wraps around each announcing component), and the compile-gate stubs for those runtime types ship here.
 * `@pyreon/native-cli` discovers it from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/a11y`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { a11yPlugin, a11yPlugin as default } from './native-plugin/plugin'
export { a11yStubs } from './native-plugin/stubs'
