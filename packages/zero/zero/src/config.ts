import type { ZeroConfig } from './types'

/**
 * Define a Zero configuration.
 * Used in `zero.config.ts` at the project root.
 *
 * @example
 * import { defineConfig } from "@pyreon/zero/config"
 *
 * export default defineConfig({
 *   mode: "ssr",
 *   ssr: { mode: "stream" },
 *   port: 3000,
 * })
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
