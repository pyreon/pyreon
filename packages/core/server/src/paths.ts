/**
 * `@pyreon/server/paths` — the path predicates both sides share, with no
 * runtime: no imports, no side effects. Server-side code (zero's Vite plugin,
 * config validation, the fragment endpoint) imports it without loading the
 * client runtime, and client code without loading `node:*`.
 */
export { isIslandName } from './island-name'
export { isRoutePath } from './route-path'
