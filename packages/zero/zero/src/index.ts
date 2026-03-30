// ─── Core ─────────────────────────────────────────────────────────────────────

export type { CreateAppOptions } from './app'
export { createApp } from './app'
export type { CreateServerOptions } from './entry-server'
export { createServer } from './entry-server'

// ─── Vite plugin ─────────────────────────────────────────────────────────────

export { zeroPlugin as default } from './vite-plugin'

// ─── File-system routing ─────────────────────────────────────────────────────

export {
  filePathToUrlPath,
  generateMiddlewareModule,
  generateRouteModule,
  parseFileRoutes,
  scanRouteFiles,
} from './fs-router'

// ─── Config ──────────────────────────────────────────────────────────────────

export { defineConfig, resolveConfig } from './config'

// ─── ISR ─────────────────────────────────────────────────────────────────────

export { createISRHandler } from './isr'

// ─── Adapters ────────────────────────────────────────────────────────────────

export { bunAdapter, nodeAdapter, resolveAdapter, staticAdapter } from './adapters'

// ─── Components ─────────────────────────────────────────────────────────────

export type { ImageProps, ImageSource } from './image'
export { Image } from './image'
export type { LinkProps, LinkRenderProps, UseLinkReturn } from './link'
export { createLink, Link, prefetchRoute, useLink } from './link'
export type { ScriptProps, ScriptStrategy } from './script'
export { Script } from './script'

// ─── Middleware ──────────────────────────────────────────────────────────────

export { compose, getContext } from './middleware'
export type { CacheConfig, CacheRule } from './cache'
export { cacheMiddleware, securityHeaders, varyEncoding } from './cache'

// ─── Font optimization ─────────────────────────────────────────────────────

export type {
  FallbackMetrics,
  FontConfig,
  FontDisplay,
  GoogleFontInput,
  GoogleFontStatic,
  GoogleFontVariable,
  LocalFont,
} from './font'
export { fontPlugin, fontVariables } from './font'

// ─── Image processing ──────────────────────────────────────────────────────

export type { FormatSource, ImageFormat, ImagePluginConfig, ProcessedImage } from './image-plugin'
export { imagePlugin } from './image-plugin'

// ─── Theme ──────────────────────────────────────────────────────────────────

export type { Theme } from './theme'
export {
  initTheme,
  resolvedTheme,
  setTheme,
  ThemeToggle,
  theme,
  themeScript,
  toggleTheme,
} from './theme'

// ─── SEO ────────────────────────────────────────────────────────────────────

export type {
  ChangeFreq,
  JsonLdType,
  RobotsConfig,
  RobotsRule,
  SeoPluginConfig,
  SitemapConfig,
  SitemapEntry,
} from './seo'
export { generateRobots, generateSitemap, jsonLd, seoMiddleware, seoPlugin } from './seo'

// ─── API routes ──────────────────────────────────────────────────────────────

export type {
  ApiContext,
  ApiHandler,
  ApiRouteEntry,
  ApiRouteModule,
  HttpMethod,
} from './api-routes'
export { createApiMiddleware, generateApiRouteModule } from './api-routes'

// ─── CORS ────────────────────────────────────────────────────────────────────

export type { CorsConfig } from './cors'
export { corsMiddleware } from './cors'

// ─── Rate limiting ──────────────────────────────────────────────────────────

export type { RateLimitConfig } from './rate-limit'
export { rateLimitMiddleware } from './rate-limit'

// ─── Compression ────────────────────────────────────────────────────────────

export type { CompressionConfig } from './compression'
export { compressionMiddleware, compressResponse, isCompressible } from './compression'

// ─── Actions ─────────────────────────────────────────────────────────────────

export type { Action, ActionContext, ActionHandler } from './actions'
export { createActionMiddleware, defineAction } from './actions'

// ─── Favicon ────────────────────────────────────────────────────────────────

export type { FaviconPluginConfig } from './favicon'
export { faviconPlugin } from './favicon'

// ─── Meta ───────────────────────────────────────────────────────────────────

export type { MetaProps } from './meta'
export { buildMetaTags, Meta } from './meta'

// ─── I18n routing ───────────────────────────────────────────────────────────

export type { I18nRoutingConfig, LocaleContext } from './i18n-routing'
export {
  buildLocalePath,
  createLocaleContext,
  detectLocaleFromHeader,
  extractLocaleFromPath,
  i18nRouting,
  setLocale,
  useLocale,
} from './i18n-routing'

// ─── Types ───────────────────────────────────────────────────────────────────

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
} from './types'
