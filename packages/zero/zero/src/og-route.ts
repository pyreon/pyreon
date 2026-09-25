/**
 * Per-route Open Graph images from JSX.
 *
 * A page route opts in by exporting `og` — a component that renders the
 * social card as **SVG JSX** from the route's params + loader data:
 *
 * ```tsx
 * // src/routes/posts/[slug].tsx
 * import type { OgImage } from '@pyreon/zero/server'
 *
 * export const loader = async ({ params }) => getPost(params.slug)
 *
 * export const og: OgImage<{ title: string }> = ({ data }) => (
 *   <svg width="1200" height="630" viewBox="0 0 1200 630">
 *     <rect width="1200" height="630" fill="#0b1020" />
 *     <text x="80" y="330" font-size="72" fill="#fff">{data?.title}</text>
 *   </svg>
 * )
 * ```
 *
 * - **SSG** paths: rendered at BUILD time to a content-hashed PNG under
 *   `assets/og/`, and `<meta property="og:image">` (+ width/height) is
 *   injected into that page's `<head>`.
 * - **SSR / ISR** routes: served at request time from
 *   `/_zero/og/<path>.png` and the matching meta tag is injected into the
 *   rendered page. The endpoint answers with `s-maxage` +
 *   `stale-while-revalidate` (3600s) so a CDN caches and revalidates it —
 *   ISR at the edge.
 *
 * The rasterizer is **sharp** (the same optional peer the image, favicon
 * and template-OG plugins use). SVG only: sharp renders SVG through librsvg,
 * which does not lay out HTML — so `<foreignObject>` / HTML elements are
 * not supported. Text wrapping is manual (`<tspan>`), as in any SVG.
 *
 * The `og` export is referenced ONLY from the server module graph (the
 * SSG sub-build and the SSR bundle) — the client bundle never imports it.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { createRouter, resolveRoute } from '@pyreon/router'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import type { Middleware } from '@pyreon/server'
import {
  injectOgMeta,
  OG_DEFAULT_HEIGHT,
  OG_DEFAULT_WIDTH,
  ogEndpointPath,
  ogMetaTags,
  pagePathFromOgEndpoint,
  rasterizeOgSvg,
  type RouteOgConfig,
} from './og-route-shared'

export {
  absoluteOgUrl,
  injectOgMeta,
  OG_DEFAULT_HEIGHT,
  OG_DEFAULT_WIDTH,
  ogEndpointPath,
  ogMetaTags,
  pagePathFromOgEndpoint,
  rasterizeOgSvg,
} from './og-route-shared'
export type { RouteOgConfig } from './og-route-shared'

/** Props handed to a route's `og` component. */
export interface OgContext<TData = unknown, TParams extends Record<string, string> = Record<string, string>> {
  /** The concrete URL path being rendered (`/posts/hello`). */
  path: string
  /** Route params resolved for `path`. */
  params: TParams
  /** The leaf route's loader data (`undefined` when it has no loader). */
  data: TData | undefined
}

/**
 * Type for a route file's `og` export — a component returning SVG JSX.
 *
 * @example
 * ```tsx
 * export const og: OgImage<{ title: string }> = ({ data }) => (
 *   <svg width="1200" height="630"><text x="60" y="320">{data?.title}</text></svg>
 * )
 * ```
 */
export type OgImage<TData = unknown, TParams extends Record<string, string> = Record<string, string>> = (
  ctx: OgContext<TData, TParams>,
) => VNodeChild

/** Route-record field the generated route module sets (server graph only). */
interface OgRecord {
  og?: () => Promise<OgImage | undefined>
}

/**
 * Render the `og` component of the leaf route matching `path` to an SVG
 * string. Returns `null` when the path matches no route or the leaf route
 * declares no `og` export. Runs the route chain's loaders (with `request`
 * when given) so `data` is the same value the page itself renders with.
 *
 * @example
 * ```ts
 * const svg = await renderRouteOgSvg(routes, '/posts/hello')
 * ```
 */
export async function renderRouteOgSvg(
  routes: RouteRecord[],
  path: string,
  request?: Request,
): Promise<string | null> {
  if (!routeHasOg(routes, path)) return null
  return runWithRequestContext(async () => {
    const router = createRouter({ routes, mode: 'history', url: path }) as ReturnType<typeof createRouter> & {
      // `RouterInstance._loaderData` (router types.ts) — the internal type is
      // not exported from @pyreon/router's entry; the SSG entry reads the
      // same field.
      _loaderData: Map<RouteRecord, unknown>
    }
    await router.preload(path, request)
    return renderOgSvgFromLoaded(routes, path, router._loaderData)
  })
}

/**
 * Like {@link renderRouteOgSvg}, but reuses loader data an existing render
 * already produced (the SSG entry passes its router's `_loaderData`, so a
 * route's loaders run ONCE per built path, not twice).
 * @internal
 */
export async function renderOgSvgFromLoaded(
  routes: RouteRecord[],
  path: string,
  loaderData: ReadonlyMap<RouteRecord, unknown>,
): Promise<string | null> {
  const resolved = resolveRoute(path, routes)
  const leaf = resolved.matched[resolved.matched.length - 1] as (RouteRecord & OgRecord) | undefined
  if (!leaf || resolved.isNotFound || typeof leaf.og !== 'function') return null
  const og = await leaf.og()
  if (typeof og !== 'function') {
    throw new Error(
      `[Pyreon] The \`og\` export for "${path}" must be a component function returning <svg> JSX ` +
        `(got ${og === null ? 'null' : typeof og}).`,
    )
  }
  const markup = await renderToString(h(og, { path, params: resolved.params, data: loaderData.get(leaf) }))
  return normalizeSvg(markup, path)
}

function normalizeSvg(markup: string, path: string): string {
  // Strip hydration comment markers — librsvg ignores comments, but a
  // leading one would defeat the root-element check below.
  // Repeated until nothing changes: one pass over `<!<!---->--` leaves a fresh
  // `<!--` behind (CodeQL js/incomplete-multi-character-sanitization).
  let svg = markup
  for (let prev = ''; prev !== svg; ) {
    prev = svg
    svg = svg.replace(/<!--[\s\S]*?-->/g, '')
  }
  svg = svg.trim()
  if (!/^<svg[\s>]/i.test(svg)) {
    throw new Error(
      `[Pyreon] The \`og\` export for "${path}" must render an <svg> root element ` +
        `(got "${svg.slice(0, 40)}…"). OG images are rasterized from SVG — wrap the card in ` +
        `<svg width="1200" height="630">…</svg>. HTML elements are not supported.`,
    )
  }
  // sharp/librsvg needs the SVG namespace; JSX authors routinely omit it.
  return /\sxmlns=/.test(svg.slice(0, svg.indexOf('>')))
    ? svg
    : svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
}

/** Whether the leaf route for `path` declares an `og` export. */
export function routeHasOg(routes: RouteRecord[], path: string): boolean {
  const resolved = resolveRoute(path, routes)
  const leaf = resolved.matched[resolved.matched.length - 1] as (RouteRecord & OgRecord) | undefined
  return !resolved.isNotFound && typeof leaf?.og === 'function'
}

/**
 * Runtime OG endpoint (`GET /_zero/og/<path>.png`) for SSR/ISR routes.
 * Auto-mounted by `createServer`. Responds with `s-maxage` +
 * `stale-while-revalidate` so a CDN caches and revalidates the image.
 */
export function createOgImageMiddleware(
  routes: RouteRecord[],
  config: RouteOgConfig & { revalidate?: number } = {},
): Middleware {
  const width = config.width ?? OG_DEFAULT_WIDTH
  const height = config.height ?? OG_DEFAULT_HEIGHT
  const ttl = config.revalidate ?? 3600
  return async (ctx) => {
    const pagePath = pagePathFromOgEndpoint(ctx.url.pathname)
    if (pagePath === null) return
    if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const svg = await renderRouteOgSvg(routes, pagePath, ctx.req)
    if (svg === null) return new Response('Not Found', { status: 404 })
    const png = await rasterizeOgSvg(svg, width, height)
    return new Response(ctx.req.method === 'HEAD' ? null : new Uint8Array(png), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
        'Cache-Control': `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl}`,
      },
    })
  }
}

/**
 * Wrap an SSR page handler so HTML responses for routes declaring `og`
 * carry `<meta property="og:image">` pointing at the runtime endpoint
 * (absolute, from the request origin). Streams pass through: bytes are
 * held only until the first `</head>`, then forwarded unbuffered.
 * @internal
 */
export function withRouteOgMeta(
  handler: (req: Request) => Promise<Response>,
  routes: RouteRecord[],
  config: RouteOgConfig = {},
): (req: Request) => Promise<Response> {
  const width = config.width ?? OG_DEFAULT_WIDTH
  const height = config.height ?? OG_DEFAULT_HEIGHT
  return async (req) => {
    const res = await handler(req)
    if (!res.body || !(res.headers.get('content-type') ?? '').includes('text/html')) return res
    const url = new URL(req.url)
    if (!routeHasOg(routes, url.pathname)) return res
    const tags = ogMetaTags(new URL(ogEndpointPath(url.pathname), url.origin).href, width, height)
    const headers = new Headers(res.headers)
    headers.delete('content-length')
    return new Response(res.body.pipeThrough(headInjector(tags)), {
      status: res.status,
      statusText: res.statusText,
      headers,
    })
  }
}

function headInjector(tags: string): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let pending = ''
  let done = false
  return new TransformStream({
    transform(chunk, controller) {
      if (done) {
        controller.enqueue(chunk)
        return
      }
      pending += decoder.decode(chunk, { stream: true })
      if (/<\/head>/i.test(pending)) {
        done = true
        controller.enqueue(encoder.encode(injectOgMeta(pending, tags)))
        pending = ''
      }
    },
    flush(controller) {
      if (!done) controller.enqueue(encoder.encode(pending + decoder.decode()))
    },
  })
}
