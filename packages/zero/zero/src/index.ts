/**
 * @pyreon/zero — client-safe exports.
 *
 * This entry contains only browser-safe components and hooks.
 * No node:fs, node:path, or other server-only imports.
 *
 * For server/build-time features, use subpath imports:
 *   import { faviconPlugin } from "@pyreon/zero/favicon"
 *   import { createServer } from "@pyreon/zero/server"
 *   import { defineConfig } from "@pyreon/zero/config"
 *   import { validateEnv } from "@pyreon/zero/env"
 */

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/zero
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

// ─── Components (browser-safe) ──────────────────────────────────────────────

export type { IconMode, IconProps, NamedIconProps, SvgComponent } from "./icon";
export { createIcon, createNamedIcon, Icon } from "./icon";
export type {
	ImageDescriptorProps,
	ImageProps,
	ImageRenderProps,
	ImageSource,
	ImageUrlProps,
	OptimizedImageProps,
	UseImageReturn,
} from "./image";
export { createImage, Image, OptimizedImage, useImage } from "./image";
export type {
	ImageRegistry,
	ImageRegistryKeyStrategy,
	ImageRegistryOptions,
} from "./image-registry";
export { createImageRegistry } from "./image-registry";
export { NoOptimize, useNoOptimize } from "./no-optimize";
export type { PreloadFontOptions } from "./use-preload-font";
export { inferFontMimeType, usePreloadFont } from "./use-preload-font";
export type { PreloadOptions } from "./use-resource-hints";
export {
	useDnsPrefetch,
	usePreconnect,
	usePreload,
} from "./use-resource-hints";
export type { LinkProps, LinkRenderProps, UseLinkReturn } from "./link";
export { createLink, Link, prefetchRoute, useLink } from "./link";
export type {
  RegisteredRoutes,
  RouteHref,
  RouteParams,
  RoutePath,
} from "./route-types";
export { extractRouteParams, generateRouteTypes } from "./route-types";
export type { ScriptProps, ScriptRenderProps, ScriptStrategy, UseScriptReturn } from "./script";
export { createScript, Script, useScript } from "./script";
export type { MetaProps } from "./meta";
export { buildMetaTags, Meta } from "./meta";

// ─── Islands (browser-safe) ──────────────────────────────────────────────────
// `island()` is re-exported from the client-safe `@pyreon/server/client`
// subentry so zero apps declare islands with `import { island } from
// "@pyreon/zero"` — no `@pyreon/server` dependency, no server-barrel leak.
// Hydration is automatic via the plugin + `startClient` (see `./client`).
export type { IslandMeta, IslandOptions } from "@pyreon/server/client";
export { island } from "@pyreon/server/client";
// Phase 4 — server islands: CDN-cacheable pages with per-request
// server-rendered holes. Client-safe (marker component + activation);
// the fragment endpoint auto-mounts in createServer.
export { activateServerIslands, serverIsland } from "@pyreon/server/client";

// ─── Theme (browser-safe) ───────────────────────────────────────────────────

export type { Theme } from "./theme";
export {
	initTheme,
	resolvedTheme,
	setSSRThemeDefault,
	setTheme,
	ThemeToggle,
	theme,
	themeScript,
	themeScriptCspHash,
	toggleTheme,
} from "./theme";

// ─── I18n hooks (browser-safe) ──────────────────────────────────────────────

export type { I18nRoutingConfig, LocaleContext } from "./i18n-routing";
export {
	buildLocalePath,
	extractLocaleFromPath,
	setLocale,
	useLocale,
} from "./i18n-routing";

// ─── Server-only APIs are NOT re-exported here (by design) ──────────────────
// `createServer`, `faviconPlugin`, `seoPlugin`, `defineConfig`, `validateEnv`,
// `ogImagePlugin`, and `aiPlugin` touch `node:*` and live ONLY on their
// per-feature subpaths (`@pyreon/zero/server` · `/favicon` · `/seo` · `/config`
// · `/env` · `/og-image` · `/ai`). They are deliberately absent from this
// client-safe barrel — importing one from `@pyreon/zero` is a STRUCTURAL
// compile error (`TS2305: '@pyreon/zero' has no exported member '<name>'`), and
// no server-stub code reaches the client bundle. This replaced a set of
// throwing/message-typed stubs whose only value was a runtime error the tsc
// gate already gives you for free once the symbol simply isn't exported.

// ─── Types (no runtime, safe everywhere) ────────────────────────────────────

export type {
	Adapter,
	AdapterBuildOptions,
	FileRoute,
	ISRConfig,
	LoaderContext,
	RenderMode,
	RouteMeta,
	RouteMiddlewareEntry,
	RouteModule,
	ZeroConfig,
} from "./types";

// ─── SEO — RSS 2.0 (pure builder, client-safe) ──────────────────────────────
//
// The other SEO generators (sitemap, robots, llms.txt, seoPlugin)
// live in `@pyreon/zero/server` because they read the filesystem at
// build time. RSS is a pure string builder and ships from the main
// client entry so consumer code can import it directly without
// pulling server-only modules.
export type { RssConfig, RssItem } from "./seo-rss";
export { generateRssFeed, toRfc822 } from "./seo-rss";
