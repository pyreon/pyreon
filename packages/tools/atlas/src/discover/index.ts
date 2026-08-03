/**
 * `@pyreon/atlas/discover` — real component discovery (dev/build-time, Node
 * only). Scans a project's source for exported components + their prop types,
 * so the catalog is the project's ACTUAL components rather than a hand-written
 * registry. Kept in its own subpath so `typescript` + `node:fs` never reach the
 * client-safe `@pyreon/atlas/auto` entry.
 */
export { scanSource } from './scan'
export type { UnmatchedFile } from './unmatched'
export { findUnmatched, formatUnmatched, pascalExports } from './unmatched'
export type { DiscoverOptions } from './discover'
export { discoverComponents, fileDiscoveryPlugin, listComponentFiles } from './discover'
export type { RocketstyleDiscoveryOptions } from './rocketstyle'
export { discoverRocketstyle, readDimensions } from './rocketstyle'
export type { AtlasConfig, LoadedConfig, PageMeta, ProjectRoot } from './config'
export { loadAtlasConfig, validatePages, validateProjects } from './config'
export type { LoadResult, ModuleLoader } from './load'
export type { MountRuntime } from '../verify/harness'
export {
  componentLoaderPlugin,
  createModuleLoader,
  loadComponent,
  loadRuntime,
  runtimeLoader,
} from './load'
