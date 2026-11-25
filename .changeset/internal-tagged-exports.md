---
'@pyreon/zero': minor
'@pyreon/zero-content': minor
'@pyreon/lint': minor
'@pyreon/storybook': minor
'@pyreon/styler': minor
'@pyreon/ui-core': minor
'@pyreon/validate': minor
'@pyreon/vite-plugin': minor
'@pyreon/unistyle': patch
'@pyreon/rocketstyle': patch
'@pyreon/server': patch
'@pyreon/reactivity': patch
'@pyreon/validation': patch
---

BREAKING: exports documented as internal or "exported for tests" (without a `_` prefix) left the public entries. Each now carries a JSDoc `@internal` tag and lives on the package's `./internal` subpath (`./internal-server` for zero's and zero-content's Node-only helpers), which carries no semver promise. `check-stability-tier` now fails any `@internal`-tagged declaration reachable from a public entry. These are clean breaks: there are no aliases, and no codemod rewrites them.

- `@pyreon/zero` → `@pyreon/zero/internal`: from `./actions`: `ACTION_QUERY_PARAM`, `ENHANCED_ACTION_HEADER`, `ACTION_REDIRECT_HEADER`, `formActionSearch`, `resolveActionOptions`, `checkActionOrigin`, `readActionPayload`, `runActionHandler`; `toRfc822` (from `.`, `./seo`, `./server`); `matchLocale`, `validateLocale` (from `./i18n-routing`); `islandsOnlyNavigation` (from `./client`); `buildHydrationReport` (from `./dev-overlay`).
- `@pyreon/zero` → `@pyreon/zero/internal-server`: `renderOgSvgFromLoaded` (`./server`), `ROUTE_MIDDLEWARE_RAN` (`./pipeline`), `generateAiPluginManifest`, `generateOpenApiSpec` (`./ai`), `compareApiRoutePatterns` (`./api-routes`), `matchGlob` (`./cache`), `isCompressible` (`./compression`), `createIcoFromPngs` (`./favicon`), `buildFontFace`, `emitFontDescriptorModule`, `fontFormat`, `fontMimeType`, `hashFontFilename`, `inferFontMeta`, `parseFontQueryOverrides` (`./font-import-plugin`), `generatePlaceholder`, `parseJpegDimensions`, `parseWebPDimensions`, `processImage`, `resolvePlaceholder`, `resolveQuality` (`./image-plugin`), `buildTextOverlaySvg`, `renderOgImage` (`./og-image`), `clusterPathsByLocale`, `formatLoc`, `isExcluded`, `resolveHreflangI18n`, `stripLocalePrefix` (`./seo`).
- `@pyreon/zero/i18n-routing`: `LocaleCtx` removed (nothing provided or read it).
- `@pyreon/zero-content` → `/internal`: `buildBreadcrumbs`, `humanize`, `buildSrcdoc`, `deriveApiId`, `filterHeadings`, `groupEntries`, `groupsFromConfig`, `renderInstallRows`; from `./blog`: `normalizeBlogFrontmatter`, `validateBlogFrontmatter`, `pageFromParam`, `resolveBlogConfig`.
- `@pyreon/zero-content` → `/internal-server`: `isBrandedComponentsRegistry`, `joinUrl`; from `./plugin`: `buildPageSearchEntry`, `collectionSlugFor`, `collectUnpublishedFiles`, `emitSeoOutputs`, `findCollectionForFileImpl`, `hasMarkdownInContentDir`, `isMarkdownId`, `isRelativePath`, `makeInternalLinkResolver`, `resolvePublishNow`, `selectPublishedEntries`, `reportPath`.
- `@pyreon/lint/cli` → `@pyreon/lint/internal`: `formatRuleList`, `parseRuleOptionsOverride`, `formatInitResult`, `parsePresetList`; `@pyreon/lint/lint-worker` → `@pyreon/lint/internal`: `lintSlice`.
- `@pyreon/storybook/preset` → `@pyreon/storybook/internal`: `previewPathFor`.
- `@pyreon/styler` → `@pyreon/styler/internal`: `setStyleExtraction`.
- `@pyreon/ui-core` → `@pyreon/ui-core/internal`: `getThemeEngine`, `setThemeEngine` (unistyle and rocketstyle import them from there).
- `@pyreon/validate` → `@pyreon/validate/internal`: `installServerCheck`, `getServerCheck`; `uninstallServerCheck` left the main entry and stays on `@pyreon/validate/server`.
- `@pyreon/vite-plugin` → `@pyreon/vite-plugin/internal`: `buildLpihClientScript`, `registerLpihMiddleware`, `resolveLpihCachePath`, `writeLpihCacheFile`, `isPyreonPackageFile`, `plainMarkerLocalNames`.

Kept public because they are documented user API (their stale `@internal` wording was removed): zero's `useNoOptimize`, `inferFontMimeType`, `generateLlmsTxt`, `generateLlmsFullTxt`, `buildCspHeader`; zero-content's `getOrCreateSharedSignal`, `resolvePrevNext`, `resolvePageLayout`; reactivity's `LPIH_DEFAULT_FILENAME`; runtime-dom's `nodesForElement`; server's `getRegisteredServerIslands`, `provideRequestLocals`; ui-core's `context` / `Provider`; validate's format-validator hooks; validation's `wrapStandardSchema`.

Upgrade: manual — import each listed name from its package's ./internal (or ./internal-server) subpath; no codemod covers this set
