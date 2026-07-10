/**
 * @pyreon/zero/server — server-only exports.
 *
 * Import from this subpath for SSR, middleware, adapters, and build tools.
 * These modules use node:fs, node:path, etc. and must NOT be imported
 * in client-side code.
 *
 * @example
 * ```ts
 * import { createServer, createApp } from "@pyreon/zero/server"
 * ```
 */

// ─── Server entry ───────────────────────────────────────────────────────────

export type { CreateAppOptions } from "./app";
export { createApp } from "./app";
export type { CreateServerOptions } from "./entry-server";
export { createServer } from "./entry-server";

// ─── Config ─────────────────────────────────────────────────────────────────

export { defineConfig, resolveConfig } from "./config";

// ─── File-system routing ────────────────────────────────────────────────────

export type { GenerateRouteModuleOptions, GetStaticPaths } from './fs-router'
export type { FileRouteModeEntry } from './fs-router'
export {
	collectFileRouteModes,
	filePathToUrlPath,
	generateMiddlewareModule,
	generateRouteModule,
	parseFileRoutes,
	scanRouteFiles,
} from './fs-router'

// ─── ISR ────────────────────────────────────────────────────────────────────

export type { RouteModeEntry } from "./route-modes";
export {
	assertModesSupported,
	collectRouteModes,
	formatRouteModeTable,
	resolveRenderModeForPath,
} from "./route-modes";
export type { ISRCacheEntry, ISRStore } from "./isr";
export { createFsStore, createISRHandler, createMemoryStore } from "./isr";

// ─── Vercel revalidate handler (M3.1) ───────────────────────────────────────

export type { VercelRevalidateHandlerOptions } from "./vercel-revalidate-handler";
export {
	_resetVercelRevalidateHandlerCache,
	vercelRevalidateHandler,
} from "./vercel-revalidate-handler";

// ─── Adapters ───────────────────────────────────────────────────────────────

export {
	BUN_ADAPTER_OUTPUT,
	CLOUDFLARE_ADAPTER_OUTPUT,
	NETLIFY_ADAPTER_OUTPUT,
	NODE_ADAPTER_OUTPUT,
	VERCEL_ADAPTER_OUTPUT,
	bunAdapter,
	cloudflareAdapter,
	netlifyAdapter,
	nodeAdapter,
	resolveAdapter,
	staticAdapter,
	vercelAdapter,
} from "./adapters";

// ─── 404 ────────────────────────────────────────────────────────────────────

export { render404Page } from "./not-found";

// ─── Middleware ──────────────────────────────────────────────────────────────

export { compose, getContext } from "./middleware";

// ─── Vite plugins ───────────────────────────────────────────────────────────

export { zeroPlugin as default, getZeroPluginConfig } from "./vite-plugin";
export type { FaviconPluginConfig, FaviconLocaleConfig } from "./favicon";
export { faviconPlugin, faviconLinks } from "./favicon";
export type { IconsPluginConfig, IconSetConfig, NamedSetInput } from "./icons-plugin";
export { iconsPlugin, iconNameFromFile, scanIconDir, generateIconSetSource, generateNamedIconSetsSource, componentNameFromSetKey } from "./icons-plugin";
export type { SeoPluginConfig, SitemapConfig, RobotsConfig, RssConfig, RssItem } from "./seo";
export { seoPlugin, generateSitemap, generateRobots, generateRssFeed, toRfc822, jsonLd, seoMiddleware } from "./seo";
export type { OgImagePluginConfig, OgImageTemplate, OgImageLayer } from "./og-image";
export { ogImagePlugin, ogImagePath } from "./og-image";
export type { PerfAdvisorConfig } from "./perf-advisor-plugin";
export { perfAdvisorPlugin } from "./perf-advisor-plugin";
export type {
	AdvisorCheckId,
	AdvisorFinding,
	AdvisorSeverity,
	RouteAdvisorInput,
	RouteAdvisorResult,
} from "./perf-advisor/checks";
export type { AiPluginConfig, InferJsonLdOptions } from "./ai";
export { aiPlugin, inferJsonLd, generateLlmsTxt, generateLlmsFullTxt } from "./ai";

// ─── I18n server-only ───────────────────────────────────────────────────────

export {
	createLocaleContext,
	detectLocaleFromHeader,
} from "./i18n-routing";
// Server-only Vite plugin — kept OUT of `i18n-routing.ts` (which is client-safe,
// re-exported from the main entry) because it holds the dynamic `node:async_hooks`
// ALS import. Importing it from a client-reachable module made Vite emit the
// `i18n-routing-als` chunk + "node:async_hooks externalized" warning in consumer
// client builds. See `i18n-routing-plugin.ts`.
export { i18nRouting } from "./i18n-routing-plugin";
