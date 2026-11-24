// ─── @pyreon/zero-content/internal-server ──────────────────────────────────
//
// INTERNAL ENTRY — NOT PUBLIC API. Nothing exported here carries a semver
// promise: any name can change or disappear in any release. Application code
// must not import it. See "What counts as public API" on the stability page
// (docs/src/content/docs/stability-and-direction.md).
//
// Node-only: these belong to the Vite plugin (`@pyreon/zero-content/plugin`)
// and its build steps, whose module graph reaches `node:*`. They are split
// from the client-safe `@pyreon/zero-content/internal` so that entry never
// pulls Node code into a browser bundle.
//
// What lives here:
//   - test-reset helpers: `_resetCompileCacheForTesting` (clear the
//     cross-build markdown cache), `_setResolvedRootForPaths` (set the root
//     `reportPath` relativises against)
//   - plugin and build helpers exported for their unit tests (search entries,
//     collection matching, publish filtering, SEO output emission, link
//     rewriting, config brand check, URL joining)

export { isBrandedComponentsRegistry } from './config'
export type { EntryMeta } from './plugin-helpers'
export {
  buildPageSearchEntry,
  collectionSlugFor,
  collectUnpublishedFiles,
  emitSeoOutputs,
  findCollectionForFileImpl,
  hasMarkdownInContentDir,
  isMarkdownId,
  isRelativePath,
  makeInternalLinkResolver,
  reportPath,
  resolvePublishNow,
  selectPublishedEntries,
} from './plugin-helpers'
export {
  _resetCompileCacheForTesting,
  setResolvedRootForPaths as _setResolvedRootForPaths,
} from './plugin-state'
export { joinUrl } from './seo/sitemap'
