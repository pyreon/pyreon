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

// ─── Components (browser-safe) ──────────────────────────────────────────────

export type { ImageProps, ImageSource } from "./image";
export { Image } from "./image";
export type { LinkProps, LinkRenderProps, UseLinkReturn } from "./link";
export { createLink, Link, prefetchRoute, useLink } from "./link";
export type { ScriptProps, ScriptStrategy } from "./script";
export { Script } from "./script";
export type { MetaProps } from "./meta";
export { buildMetaTags, Meta } from "./meta";

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
