export { bunAdapter } from './bun'
export { cloudflareAdapter } from './cloudflare'
export { netlifyAdapter } from './netlify'
export { nodeAdapter } from './node'
export { staticAdapter } from './static'
export { vercelAdapter } from './vercel'

import type { Adapter, ZeroConfig } from '../types'
import { bunAdapter } from './bun'
import { cloudflareAdapter } from './cloudflare'
import { netlifyAdapter } from './netlify'
import { nodeAdapter } from './node'
import { staticAdapter } from './static'
import { vercelAdapter } from './vercel'

/**
 * Resolve the adapter from config.
 * Returns a built-in adapter or throws if unknown.
 *
 * Accepts BOTH forms — the `ZeroConfig.adapter` type advertises string
 * names (`'vercel'` / `'cloudflare'` / …) but the scaffolded templates
 * historically emit `adapter: vercelAdapter()` (an Adapter instance via
 * the named factory). Both work: a string goes through the switch lookup;
 * an Adapter object (duck-typed via `name` + `build` fields) passes
 * through. Pre-PR-J `resolveAdapter` was never called from production
 * code so the string-vs-object mismatch was invisible; PR J wires the
 * call into `ssgPlugin.closeBundle`, surfacing the contract divergence.
 * The passthrough preserves both shapes without a breaking type change.
 */
export function resolveAdapter(config: ZeroConfig): Adapter {
  const value = config.adapter ?? 'node'

  // Passthrough for already-constructed Adapter instances. Scaffolded
  // templates emit `adapter: vercelAdapter()` — detect by duck-typing
  // the two required Adapter fields (`name: string` + `build: function`).
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Adapter).name === 'string' &&
    typeof (value as Adapter).build === 'function'
  ) {
    return value as Adapter
  }

  switch (value) {
    case 'node':
      return nodeAdapter()
    case 'bun':
      return bunAdapter()
    case 'static':
      return staticAdapter()
    case 'vercel':
      return vercelAdapter()
    case 'cloudflare':
      return cloudflareAdapter()
    case 'netlify':
      return netlifyAdapter()
    default:
      throw new Error(
        `[Pyreon] Unknown adapter: "${String(value)}". Use "node", "bun", "static", "vercel", "cloudflare", or "netlify".`,
      )
  }
}
