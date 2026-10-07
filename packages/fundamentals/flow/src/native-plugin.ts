/**
 * `@pyreon/flow/native-plugin` — how this library crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: `createFlow` / `useFlow`, the `<Flow>`
 * host and its satellites, the edge-path and marker helpers, `<FlowWebView>`, and
 * the compile-gate stubs for the flow runtime. `@pyreon/native-cli` discovers it
 * from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/flow`, so `@pyreon/native-compiler` carries none of it.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { flowPlugin, flowPlugin as default } from './native-plugin/plugin'
export { flowStubs } from './native-plugin/stubs'
