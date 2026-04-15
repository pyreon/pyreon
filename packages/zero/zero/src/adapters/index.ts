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
 */
export function resolveAdapter(config: ZeroConfig): Adapter {
  const name = config.adapter ?? 'node'

  switch (name) {
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
      throw new Error(`[Pyreon] Unknown adapter: "${name}". Use "node", "bun", "static", "vercel", "cloudflare", or "netlify".`)
  }
}
