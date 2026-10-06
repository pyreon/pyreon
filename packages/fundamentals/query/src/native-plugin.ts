/**
 * `@pyreon/query/native-plugin` — how this library crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: `useQuery`, `useStream`, `new QueryClient()` and the
 * transparent `<QueryClientProvider>`, plus the compile-gate stubs for the `PyreonQuery` /
 * `PyreonStream` runtimes. `@pyreon/native-cli` discovers it from `package.json` →
 * `pyreon.native.plugin` when a source file imports `@pyreon/query`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { queryPlugin, queryPlugin as default } from './native-plugin/plugin'
export { queryStubs } from './native-plugin/stubs'
