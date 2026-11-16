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
// Building blocks for a package whose own hook IS a query or a mutation (`@pyreon/feature`'s CRUD hooks): the same
// containers, harnesses and call-site emit, driven by a request that package builds itself.
export { mutationDecl, mutationReceiver, queryContainerDecl, queryReceiver } from './native-plugin/plugin'
export {
  MUTATE_ASYNC_TYPE,
  MUTATE_TYPE,
  mutateAsyncExpr,
  mutateCallSpec,
  mutateExpr,
  scanMutations,
  type Callbacks as MutationCallbacks,
  type MutateBinding,
  type MutateQueryEffects,
  type MutateRequest,
} from './native-plugin/mutation'
export type { QueryPayload } from './native-plugin/types'
