import type { ZeroConfig } from './types'

/**
 * Define a Zero configuration — a typed identity helper for building the
 * object you pass to `zero()` in `vite.config.ts`. (There is no separate
 * `zero.config.ts`; nothing reads one.)
 *
 * @example
 * import zero, { defineConfig } from "@pyreon/zero/server"
 *
 * const config = defineConfig({
 *   mode: "ssr",
 *   ssr: { mode: "stream" },
 *   port: 3000,
 * })
 *
 * export default { plugins: [pyreon(), zero(config)] }
 */
export function defineConfig(config: ZeroConfig): ZeroConfig {
  return config
}

/**
 * Detect the deploy platform from its well-known build environment
 * variables: Vercel sets `VERCEL=1`, Netlify sets `NETLIFY=true`,
 * Cloudflare Pages sets `CF_PAGES=1`. Returns null when no platform is
 * detected (local / self-hosted builds).
 */
export function detectPlatformAdapter(
  env: Record<string, string | undefined> = process.env,
): 'vercel' | 'netlify' | 'cloudflare' | null {
  if (env.VERCEL) return 'vercel'
  if (env.NETLIFY) return 'netlify'
  if (env.CF_PAGES) return 'cloudflare'
  return null
}

// Announce auto-detection once per process — resolveConfig is called from
// several plugin factories during a single build.
let _announcedAutoAdapter = false

/**
 * Zero-config adapter selection: an explicit `adapter:` always wins; when
 * omitted and the build runs ON a deploy platform, that platform's adapter
 * is used automatically (`zero()` with no adapter just works on Vercel /
 * Netlify / Cloudflare Pages); local + self-hosted builds default to node.
 */
function defaultAdapter(): NonNullable<ZeroConfig['adapter']> {
  const detected = detectPlatformAdapter()
  if (!detected) return 'node'
  if (!_announcedAutoAdapter) {
    _announcedAutoAdapter = true
    // oxlint-disable-next-line no-console
    console.log(
      `[Pyreon] Detected ${detected} build environment — using the "${detected}" adapter (set zero({ adapter }) to override).`,
    )
  }
  return detected
}

/**
 * zero works with TWO bases, and every URL it writes uses exactly one:
 *
 * - the **route base** — where the app's pages live: router links, `pushState`
 *   URLs, `__ZERO_BASE__`, redirect canonicals, i18n prefixes, the PWA
 *   manifest/scope and the server's routing. Always a root-relative path.
 * - the **asset base** — Vite's resolved `base`, where built files live:
 *   chunks, modulepreloads, CSS assets, self-hosted fonts, OG images. It may be
 *   a path, a relative `./`, or a full CDN URL.
 *
 * Precedence: `zero({ base })` is returned from zero's `config()` hook, so when
 * set it is BOTH bases. Without it, Vite's base (CLI `--base`, inline
 * `build({ base })`, `vite.config.base`) is the asset base, and also the route
 * base when it is a path; a `./` or CDN asset base leaves the route base `/`.
 */
export function routeBaseOf(zeroBase: string | undefined, assetBase: string | undefined): string {
  if (zeroBase !== undefined) return zeroBase
  return assetBase !== undefined && assetBase.startsWith('/') ? assetBase : '/'
}

/** A Vite base that is relative to the HTML document (`./`, `''`). */
export function isRelativeBase(base: string): boolean {
  return base === '' || base.startsWith('.')
}

/**
 * Make `config.base` the ROUTE base (see {@link routeBaseOf}) once Vite has
 * resolved its own. Each zero plugin calls this from its `configResolved`, so
 * `config.base` is never a stale pre-resolution value; asset URLs read Vite's
 * resolved base directly, never `config.base`.
 *
 * @returns whether `config.base` changed.
 * @internal — used by zero's own plugins; not exported from a public entry.
 */
export function adoptRouteBase(
  config: { base: string },
  zeroBase: string | undefined,
  assetBase: string | undefined,
): boolean {
  const route = routeBaseOf(zeroBase, assetBase)
  if (route === config.base) return false
  config.base = route
  return true
}

/** Merge user config with defaults. */
export function resolveConfig(
  userConfig: ZeroConfig = {},
): Required<Pick<ZeroConfig, 'mode' | 'base' | 'port' | 'adapter' | 'entryClient'>> &
  ZeroConfig {
  return {
    mode: 'ssr',
    base: '/',
    port: 3000,
    entryClient: '/src/entry-client.ts',
    ...userConfig,
    adapter: userConfig.adapter ?? defaultAdapter(),
    ssr: {
      mode: 'string',
      ...userConfig.ssr,
    },
  }
}
