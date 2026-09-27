import type { ZeroConfig } from './types'

/**
 * The part of `zero({...})` that the production server needs at runtime and
 * that survives serialization into the server build.
 *
 * zero's plugin injects this as `__ZERO_SERVER_CONFIG__` (read by
 * `createServer`). The generated server entry cannot import `vite.config.ts`,
 * so before this existed it rendered with NO config at all: `mode: 'isr'`,
 * `base`, `ssr.mode` and `routeRules` shaped the build and then silently did
 * nothing in production.
 *
 * Functions cannot cross into the bundle. They are reported in `dropped` so
 * the build can say so instead of quietly ignoring them.
 */
export interface SerializedServerConfig {
  value: Pick<ZeroConfig, 'mode' | 'base' | 'ssr' | 'isr' | 'routeRules' | 'i18n' | 'routeOg'>
  /** Config paths whose value is code and so cannot reach the server bundle. */
  dropped: string[]
}

export function serializeServerConfig(config: ZeroConfig): SerializedServerConfig {
  const value: SerializedServerConfig['value'] = {}
  const dropped: string[] = []

  if (config.mode !== undefined) value.mode = config.mode
  if (config.base !== undefined) value.base = config.base
  if (config.ssr !== undefined) value.ssr = { ...config.ssr }
  if (config.routeRules !== undefined) value.routeRules = JSON.parse(JSON.stringify(config.routeRules))
  if (config.i18n !== undefined) value.i18n = JSON.parse(JSON.stringify(config.i18n))
  if (config.routeOg !== undefined) value.routeOg = { ...config.routeOg }

  if (config.isr !== undefined) {
    const { store, revalidateRequest, responseFilter, tagsForRequest, cacheKey, ...data } =
      config.isr
    const code = { store, revalidateRequest, responseFilter, tagsForRequest }
    for (const [key, v] of Object.entries(code)) if (v !== undefined) dropped.push(`isr.${key}`)
    // `cacheKey` is data when it is the `'path-only'` shorthand, code otherwise.
    if (typeof cacheKey === 'function') dropped.push('isr.cacheKey')
    value.isr = cacheKey === 'path-only' ? { ...data, cacheKey } : data
  }

  const mw = config.middleware
  if (mw !== undefined && (!Array.isArray(mw) || mw.length > 0)) dropped.push('middleware')

  return { value, dropped }
}
