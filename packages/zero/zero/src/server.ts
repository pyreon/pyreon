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

export type { GenerateRouteModuleOptions } from './fs-router'
export {
	filePathToUrlPath,
	generateMiddlewareModule,
	generateRouteModule,
	parseFileRoutes,
	scanRouteFiles,
} from './fs-router'

// ─── ISR ────────────────────────────────────────────────────────────────────

export { createISRHandler } from "./isr";

// ─── Adapters ───────────────────────────────────────────────────────────────

export {
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

export { zeroPlugin as default } from "./vite-plugin";
export type { FaviconPluginConfig, FaviconLocaleConfig } from "./favicon";
export { faviconPlugin, faviconLinks } from "./favicon";
export type { SeoPluginConfig, SitemapConfig, RobotsConfig } from "./seo";
export { seoPlugin, generateSitemap, generateRobots, jsonLd, seoMiddleware } from "./seo";
export type { OgImagePluginConfig, OgImageTemplate, OgImageLayer } from "./og-image";
export { ogImagePlugin, ogImagePath } from "./og-image";
export type { AiPluginConfig, InferJsonLdOptions } from "./ai";
export { aiPlugin, inferJsonLd, generateLlmsTxt, generateLlmsFullTxt } from "./ai";

// ─── I18n server-only ───────────────────────────────────────────────────────

export {
	createLocaleContext,
	detectLocaleFromHeader,
	i18nRouting,
} from "./i18n-routing";
