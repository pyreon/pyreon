/**
 * Framework-free helpers for route-level OG images — imported by the SSG
 * build plugin (Node) AND re-exported through `og-route.ts` for the server
 * bundle. Kept free of `@pyreon/*` runtime imports so loading it into the
 * Vite plugin process never registers a second framework instance.
 */

/** Configuration for route-level OG images (`zero({ routeOg })`). */
export interface RouteOgConfig {
  /** Output width in px. Default 1200. */
  width?: number
  /** Output height in px. Default 630. */
  height?: number
  /**
   * Absolute site origin (`https://example.com`; only the origin is used —
   * `zero({ base })` is applied separately) used to make the injected
   * `og:image` URL absolute at build time. Most crawlers (Facebook, LinkedIn,
   * Slack) require an ABSOLUTE URL; without it the SSG meta tag is
   * root-relative. The runtime (SSR/ISR) path always uses the request origin.
   */
  siteUrl?: string
}

/** Default OG card dimensions — the Open Graph recommended 1.91:1 size. */
export const OG_DEFAULT_WIDTH = 1200
export const OG_DEFAULT_HEIGHT = 630

const OG_ENDPOINT_PREFIX = '/_zero/og'

/**
 * URL of the runtime OG endpoint for a page path.
 *
 * @example
 * ```ts
 * ogEndpointPath('/')            // '/_zero/og/index.png'
 * ogEndpointPath('/posts/hello') // '/_zero/og/posts/hello.png'
 * ```
 */
export function ogEndpointPath(pagePath: string): string {
  const clean = pagePath.split(/[?#]/)[0]!.replace(/\/+$/, '')
  return `${OG_ENDPOINT_PREFIX}${clean === '' ? '/index' : clean}.png`
}

/** Inverse of {@link ogEndpointPath}; `null` for a non-OG URL. */
export function pagePathFromOgEndpoint(pathname: string): string | null {
  if (!pathname.startsWith(`${OG_ENDPOINT_PREFIX}/`) || !pathname.endsWith('.png')) return null
  const inner = pathname.slice(OG_ENDPOINT_PREFIX.length, -'.png'.length)
  if (inner === '' || inner.includes('..')) return null
  return inner === '/index' ? '/' : inner
}

interface SharpLike {
  (input: Buffer): {
    resize(w: number, h: number, o: { fit: 'fill' }): { png(): { toBuffer(): Promise<Buffer> } }
  }
}

/**
 * Rasterize SVG markup to a PNG of exactly `width` × `height`.
 * Throws a `[Pyreon]` error naming the fix when `sharp` is not installed.
 *
 * @example
 * ```ts
 * const png = await rasterizeOgSvg(svg, 1200, 630)
 * ```
 */
export async function rasterizeOgSvg(svg: string, width: number, height: number): Promise<Buffer> {
  let sharp: SharpLike
  try {
    const mod = (await import('sharp')) as unknown as { default?: SharpLike }
    sharp = mod.default ?? (mod as unknown as SharpLike)
  } catch {
    throw new Error(
      '[Pyreon] Route `og` images need the optional peer `sharp` to rasterize SVG to PNG. ' +
        'Install it: `bun add -D sharp` (or npm/pnpm/yarn). Remove the route\'s `og` export to skip OG generation.',
    )
  }
  return sharp(Buffer.from(svg)).resize(width, height, { fit: 'fill' }).png().toBuffer()
}

/** Escape a value for a double-quoted HTML attribute. */
function escAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Build the `og:image` meta tags for an image URL.
 * @internal
 */
export function ogMetaTags(url: string, width: number, height: number): string {
  return (
    `<meta property="og:image" content="${escAttr(url)}">` +
    `<meta property="og:image:width" content="${width}">` +
    `<meta property="og:image:height" content="${height}">` +
    `<meta name="twitter:card" content="summary_large_image">`
  )
}

/**
 * Insert OG meta tags before `</head>` unless the page already declares
 * `og:image` (an explicit `useHead` value always wins).
 * @internal
 */
export function injectOgMeta(html: string, tags: string): string {
  if (/property=["']og:image["']/i.test(html)) return html
  const idx = html.search(/<\/head>/i)
  return idx === -1 ? html : `${html.slice(0, idx)}${tags}${html.slice(idx)}`
}

/** Absolute (when `siteUrl` is set) URL for a built OG asset. */
export function absoluteOgUrl(href: string, siteUrl: string | undefined): string {
  // `href` is already base-prefixed; only the ORIGIN of `siteUrl` is used,
  // so `base` is never applied twice.
  return siteUrl ? `${new URL(siteUrl).origin}${href}` : href
}

