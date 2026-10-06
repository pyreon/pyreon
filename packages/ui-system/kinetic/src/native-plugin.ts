/**
 * `@pyreon/kinetic/native-plugin` — what the `kinetic()` factory lowers to on SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the factory is a web CSS-class engine, so the binding itself never reaches the emit
 * and `<Box>` lowers to the canonical `<Transition>` when its chain names a preset both targets know (the presets come from
 * the chain's literal or from `@pyreon/kinetic-presets`), else to a plain container with a named warning. `@pyreon/native-cli`
 * discovers it from `package.json` → `pyreon.native.plugin` when a source file imports `@pyreon/kinetic` or
 * `@pyreon/kinetic-presets`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { kineticPlugin, kineticPlugin as default } from './native-plugin/plugin'
