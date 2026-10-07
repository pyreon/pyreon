/**
 * `@pyreon/rx/native-plugin` — how `rx.filter(todos, p)` and the standalone `filter(todos, p)` cross to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: the import-gated recognizer (the namespace form and the standalone, source-first
 * transforms), the expression emitters for both targets, their typing and the unlowered-export advice. `@pyreon/native-cli`
 * discovers it from `package.json` → `pyreon.native.plugin` when a source file imports `@pyreon/rx`.
 *
 * Tooling-only — nothing here is reachable from the web entry point.
 */
export { rxPlugin, rxPlugin as default } from './native-plugin/plugin'
