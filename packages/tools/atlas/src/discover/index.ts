/**
 * `@pyreon/atlas/discover` — real component discovery (dev/build-time, Node
 * only). Scans a project's source for exported components + their prop types,
 * so the catalog is the project's ACTUAL components rather than a hand-written
 * registry. Kept in its own subpath so `typescript` + `node:fs` never reach the
 * client-safe `@pyreon/atlas/auto` entry.
 */
export { scanSource } from './scan'
export type { DiscoverOptions } from './discover'
export { discoverComponents, fileDiscoveryPlugin } from './discover'
