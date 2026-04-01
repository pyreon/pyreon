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

// ─── Server-only stubs ──────────────────────────────────────────────────────
// Throw clear error messages when developers accidentally import server-only
// APIs from the main entry. These are tree-shaken if not imported.

function serverOnly(name: string, subpath: string): never {
  throw new Error(
    `[Pyreon] "${name}" is server-only and cannot be imported from "@pyreon/zero".\n` +
    `Import from the subpath instead:\n\n` +
    `  import { ${name} } from "@pyreon/zero/${subpath}"\n`,
  )
}

/* eslint-disable @typescript-eslint/no-unused-vars */
/** @deprecated Import from `@pyreon/zero/favicon` instead */
export function faviconPlugin(..._: unknown[]): never { return serverOnly('faviconPlugin', 'favicon') }
/** @deprecated Import from `@pyreon/zero/seo` instead */
export function seoPlugin(..._: unknown[]): never { return serverOnly('seoPlugin', 'seo') }
/** @deprecated Import from `@pyreon/zero/server` instead */
export function createServer(..._: unknown[]): never { return serverOnly('createServer', 'server') }
/** @deprecated Import from `@pyreon/zero/config` instead */
export function defineConfig(..._: unknown[]): never { return serverOnly('defineConfig', 'config') }
/** @deprecated Import from `@pyreon/zero/env` instead */
export function validateEnv(..._: unknown[]): never { return serverOnly('validateEnv', 'env') }
/** @deprecated Import from `@pyreon/zero/og-image` instead */
export function ogImagePlugin(..._: unknown[]): never { return serverOnly('ogImagePlugin', 'og-image') }
/** @deprecated Import from `@pyreon/zero/ai` instead */
export function aiPlugin(..._: unknown[]): never { return serverOnly('aiPlugin', 'ai') }

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
