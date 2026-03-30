export { bunAdapter } from './bun'
export { nodeAdapter } from './node'
export { staticAdapter } from './static'

import type { Adapter, ZeroConfig } from '../types'
import { bunAdapter } from './bun'
import { nodeAdapter } from './node'
import { staticAdapter } from './static'

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
    default:
      throw new Error(`[zero] Unknown adapter: "${name}". Use "node", "bun", or "static".`)
  }
}
