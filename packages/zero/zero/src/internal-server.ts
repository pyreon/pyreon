// ─── @pyreon/zero/internal-server ───────────────────────────────────────────
//
// INTERNAL ENTRY — NOT PUBLIC API. Nothing exported here carries a semver
// promise: any name can change or disappear in any release. Application code
// must not import it. See "What counts as public API" on the stability page
// (docs/src/content/docs/stability-and-direction.md).
//
// Server-only: the build plugins and request middleware behind these names
// run in Node (most of their modules import `node:*`), so they are kept off
// the client-safe `@pyreon/zero/internal`, which plugin-generated browser
// code imports.
//
// What lives here:
//   - plugin-generated-code helpers: `renderOgSvgFromLoaded` (the SSG entry
//     `ssg-plugin.ts` generates renders route OG images through it)
//   - cross-module internals: `ROUTE_MIDDLEWARE_RAN` (request-locals flag)
//   - test-reset helpers: `_resetVercelRevalidateHandlerCache` — drop the
//     Vercel revalidate handler's cached prerender manifest
//   - build/middleware helpers exported for their unit tests: AI manifests,
//     API-route ordering, cache globs, compression filter, favicon ICO
//     packing, font and image processing, OG image rendering, sitemap
//     internals

export { generateAiPluginManifest, generateOpenApiSpec } from './ai-manifests'
export { compareApiRoutePatterns } from './api-route-order'
export { matchGlob } from './cache-glob'
export { isCompressible } from './compression-filter'
export { createIcoFromPngs } from './favicon-ico'
export {
  buildFontFace,
  emitFontDescriptorModule,
  fontFormat,
  fontMimeType,
  hashFontFilename,
  inferFontMeta,
  parseFontQueryOverrides,
} from './font-import-helpers'
export {
  generatePlaceholder,
  parseJpegDimensions,
  parseWebPDimensions,
  processImage,
  resolvePlaceholder,
  resolveQuality,
} from './image-processing'
export { buildTextOverlaySvg, renderOgImage } from './og-image-render'
export { renderOgSvgFromLoaded, ROUTE_MIDDLEWARE_RAN } from './og-route'
export type { Cluster } from './seo-internals'
export {
  clusterPathsByLocale,
  formatLoc,
  isExcluded,
  resolveHreflangI18n,
  stripLocalePrefix,
} from './seo-internals'
export { _resetVercelRevalidateHandlerCache } from './vercel-revalidate-handler'
