// `@pyreon/compiler` — the LEAN main entry: the JSX transform and the
// pre-passes that run inside it. Nothing reachable from here imports the
// TypeScript compiler API (`typescript`), so a consumer that only needs
// `transformJSX` (the vite-plugin's static graph, a test harness, a bundler
// integration) never loads it. Locked by `tests/main-entry-ts-free.test.ts`.
//
// The `typescript`-backed surface lives behind three subpaths:
//   - `@pyreon/compiler/analyze`  — pattern detectors, migrators, Reactivity Lens
//   - `@pyreon/compiler/audits`   — project audits + the project scanner
//   - `@pyreon/compiler/validate` — the @pyreon/validate analyzer/emitter
// (`/diagnose`, `/plain` and `/fs-route-convention` are separate, TS-free subpaths.)
export type { DeferInlineResult, DeferInlineWarning } from './defer-inline'
export { transformDeferInline } from './defer-inline'
export type {
  CompilerWarning,
  ReactivityKind,
  ReactivitySpan,
  TransformResult,
} from './jsx'
export {
  transformJSX,
  transformJSX_JS,
  rocketstyleCollapseKey,
  scanCollapsibleSites,
  TPL_HOLE_ATTR,
} from './jsx'
export type { CollapsibleSite, StaticChild, StaticChildNode } from './jsx'
export type { PlainOptions, PlainTransformResult } from './plain'
export { detectPlain, transformPlain } from './plain'
export type {
  MigrateToPlainResult,
  PlainDeclineCode,
  PlainMigrateDeclined,
} from './plain-migrate'
export { migrateToPlain } from './plain-migrate'
// The @pyreon/zero fs-route convention — single source of truth shared by the
// project scanner (`@pyreon/compiler/audits`) and `@pyreon/zero`'s
// fs-router/api-routes (which re-export it via the
// `@pyreon/compiler/fs-route-convention` subpath).
export {
  apiFilePathToPattern,
  filePathToUrlPath,
  isApiRoute,
  ROUTE_EXTENSIONS,
  SPECIAL_ROUTE_FILES,
  stripRouteExtension,
} from './fs-route-convention'
// Island auto-name derivation — shared by `@pyreon/vite-plugin`'s
// injectIslandNames / scanIslandDeclarations and the project scanner.
export { deriveIslandName, fnv1a6, islandRelPath } from './island-naming'
