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
 * Make `config.base` Vite's RESOLVED base — the single base every zero plugin
 * reads for the URLs it writes (SSG preloads, CSS assets, OG images, redirect
 * canonicals, the PWA worker, the server config). Each zero plugin calls this
 * from its own `configResolved`, so no call site can read a base that differs
 * from the one Vite applied to the assets.
 *
 * Precedence is settled before this runs: `zero({ base })` is returned from
 * zero's `config()` hook (so it IS the resolved base when set); without it
 * Vite's own base (CLI `--base`, inline `build({ base })`, `vite.config.base`)
 * stands; with neither it is `/`. A relative base (`./`) only describes asset
 * URLs, not routes, so it leaves `config.base` as it was.
 *
 * @returns whether `config.base` changed.
 */
export function adoptResolvedBase(config: { base: string }, resolvedBase: string | undefined): boolean {
  if (resolvedBase === undefined || !resolvedBase.startsWith('/') || resolvedBase === config.base) return false
  config.base = resolvedBase
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
