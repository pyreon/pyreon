import type { ComponentFn } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import type { Middleware, MiddlewareContext } from '@pyreon/server'
import { createHandler } from '@pyreon/server'
import type { ApiRouteEntry } from './api-routes'
import { createApiMiddleware } from './api-routes'
import { createApp } from './app'
import { render404Page } from './not-found'
import type { RouteMiddlewareEntry, ZeroConfig } from './types'

// ─── Server entry factory ───────────────────────────────────────────────────

export interface CreateServerOptions {
  /** Route definitions. */
  routes: RouteRecord[]
  /** Zero config. */
  config?: ZeroConfig
  /** Additional middleware. */
  middleware?: Middleware[]
  /** Per-route middleware from virtual:zero/route-middleware. */
  routeMiddleware?: RouteMiddlewareEntry[]
  /** API route entries from virtual:zero/api-routes. */
  apiRoutes?: ApiRouteEntry[]
  /** HTML template override. */
  template?: string
  /** Client entry path. */
  clientEntry?: string
  /** Component to render when no route matches (from _404.tsx). */
  notFoundComponent?: ComponentFn
}

/**
 * Create a middleware that dispatches per-route middleware based on URL pattern matching.
 */
function createRouteMiddlewareDispatcher(entries: RouteMiddlewareEntry[]): Middleware {
  return async (ctx: MiddlewareContext) => {
    for (const entry of entries) {
      if (matchPattern(entry.pattern, ctx.path)) {
        const mw = Array.isArray(entry.middleware) ? entry.middleware : [entry.middleware]
        for (const fn of mw) {
          const result = await fn(ctx)
          if (result) return result
        }
      }
    }
  }
}

/**
 * URL pattern matcher supporting :param and :param* segments.
 *
 * Rules:
 * - Static segments must match exactly
 * - `:param` matches a single path segment
 * - `:param*` matches all remaining segments (must be last, and path must
 *   have matched all preceding segments)
 * - Path length must match pattern length (unless catch-all)
 */
export function matchPattern(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!

    // Catch-all: matches remaining segments, but only if we've matched
    // all preceding segments up to this point
    if (pp.endsWith('*')) {
      // All segments before the catch-all must have matched (we got here)
      // and there must be at least one remaining path segment
      return i <= pathParts.length
    }

    // No more path segments to match against
    if (i >= pathParts.length) return false

    // Dynamic segment matches any single segment
    if (pp.startsWith(':')) continue

    // Static segment must match exactly
    if (pp !== pathParts[i]) return false
  }

  // All pattern parts consumed — path must also be fully consumed
  return patternParts.length === pathParts.length
}

/**
 * Create the SSR request handler for production.
 *
 * @example
 * import { routes } from "virtual:zero/routes"
 * import { routeMiddleware } from "virtual:zero/route-middleware"
 * import { createServer } from "@pyreon/zero"
 *
 * export default createServer({ routes, routeMiddleware, apiRoutes })
 */
export function createServer(options: CreateServerOptions) {
  const config = options.config ?? {}

  const allMiddleware: Middleware[] = []

  // API routes run first — they short-circuit before SSR
  if (options.apiRoutes?.length) {
    allMiddleware.push(createApiMiddleware(options.apiRoutes))
  }

  // Per-route middleware runs next
  if (options.routeMiddleware?.length) {
    allMiddleware.push(createRouteMiddlewareDispatcher(options.routeMiddleware))
  }

  // Then global middleware from config and options
  allMiddleware.push(...(config.middleware ?? []))
  allMiddleware.push(...(options.middleware ?? []))

  const { App } = createApp({
    routes: options.routes,
    routerMode: 'history',
    // Forward zero's `base` to createRouter so RouterLinks render
    // correctly prefixed hrefs during SSR — must match the value
    // the client-side `startClient` reads from `__ZERO_BASE__` so
    // hydration doesn't mismatch.
    ...(config.base && config.base !== '/' ? { base: config.base } : {}),
  })

  const handler = createHandler({
    App,
    routes: options.routes,
    middleware: allMiddleware,
    mode: config.ssr?.mode ?? 'string',
    ...(options.template ? { template: options.template } : {}),
    ...(options.clientEntry ? { clientEntry: options.clientEntry } : {}),
  })

  // M1.2 — Runtime SSR 404 routes through the router (PR L5).
  // When a URL doesn't match any leaf, @pyreon/router's resolveRoute
  // walks up to the closest parent `notFoundComponent` and builds a
  // synthetic chain `[...ancestorLayouts, syntheticLeaf]`. The handler
  // renders that chain, producing 404 HTML INSIDE the layout's chrome,
  // and reads `resolved.isNotFound` to set HTTP status 404. This
  // replaces the pre-M1 URL-pattern wrapper that bypassed the router
  // for unmatched URLs and rendered the not-found component standalone
  // (no layout wrapping).
  //
  // `options.notFoundComponent` is a legacy fallback for apps that
  // don't carry `_404.tsx` in their routes tree. When set AND the
  // routes tree has no reachable `notFoundComponent`, we render the
  // standalone shape as a final fallback. The canonical pattern is
  // `_404.tsx` inside a `_layout.tsx` directory — that goes through
  // PR L5's router-driven path and gets layout chrome for free.
  if (!options.notFoundComponent) return handler

  const NotFound = options.notFoundComponent
  const hasRouteTreeNotFound = routeTreeHasNotFound(options.routes)

  return async (req: Request) => {
    // Route-tree notFoundComponent present → handler handles 404 via
    // resolveRoute's `isNotFound` fallback (PR L5). Skip the legacy
    // wrapper entirely — handler.ts sets status 404 + renders layout
    // chrome correctly.
    if (hasRouteTreeNotFound) return handler(req)

    // Legacy fallback: routes tree has no notFoundComponent but the
    // caller passed `options.notFoundComponent`. Run the URL-pattern
    // check + standalone render for backward compat.
    const url = new URL(req.url)
    const pathname = url.pathname
    if (!routePatternsCache(options.routes).some((p) => matchPattern(p, pathname))) {
      const fullHtml = await render404Page(NotFound, options.template)
      return new Response(fullHtml, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return handler(req)
  }
}

/** Walk the route tree looking for any record with a `notFoundComponent`. */
function routeTreeHasNotFound(routes: RouteRecord[]): boolean {
  for (const r of routes) {
    if (typeof (r as { notFoundComponent?: unknown }).notFoundComponent === 'function') {
      return true
    }
    if (r.children && routeTreeHasNotFound(r.children as RouteRecord[])) {
      return true
    }
  }
  return false
}

/** Lazy cache of flattened patterns — only computed if legacy fallback fires. */
const _routePatternsCache = new WeakMap<RouteRecord[], string[]>()
function routePatternsCache(routes: RouteRecord[]): string[] {
  const cached = _routePatternsCache.get(routes)
  if (cached) return cached
  const out = flattenRoutePatterns(routes)
  _routePatternsCache.set(routes, out)
  return out
}

/** Extract all URL patterns from a nested route tree. */
function flattenRoutePatterns(routes: RouteRecord[], prefix = ''): string[] {
  const patterns: string[] = []
  for (const route of routes) {
    const fullPath = route.path === '/' && prefix ? prefix : `${prefix}${route.path}`
    patterns.push(fullPath)
    if (route.children) {
      patterns.push(...flattenRoutePatterns(route.children as RouteRecord[], fullPath))
    }
  }
  return patterns
}
