export { bunAdapter } from './bun'
export { cloudflareAdapter } from './cloudflare'
export { denoAdapter } from './deno'
// Adapter OUTPUT-PATH contract — where each adapter stages its artifacts
// inside `outDir`. Consumed by the adapters themselves AND locked against
// `@pyreon/create-zero`'s scaffolded deploy configs by a contract test,
// so the two can never drift (see contract.ts).
export {
  BUN_ADAPTER_OUTPUT,
  CLOUDFLARE_ADAPTER_OUTPUT,
  DENO_ADAPTER_OUTPUT,
  NETLIFY_ADAPTER_OUTPUT,
  NODE_ADAPTER_OUTPUT,
  VERCEL_ADAPTER_OUTPUT,
} from './contract'
export { netlifyAdapter } from './netlify'
export type { NetlifyAdapterOptions } from './netlify'
export { nodeAdapter } from './node'
export type { NodeAdapterOptions } from './node'
export type { BunAdapterOptions } from './bun'
export type { DeployTargets, RouteRuntime, ScheduledRoute } from './deploy-targets'
export { staticAdapter } from './static'
export { vercelAdapter } from './vercel'
export type { VercelAdapterOptions } from './vercel'

import type { Adapter, ZeroConfig } from '../types'
import { bunAdapter } from './bun'
import { cloudflareAdapter } from './cloudflare'
import { denoAdapter } from './deno'
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
    typeof value === 'object'
    && value !== null
    && typeof (value as Adapter).name === 'string'
    && typeof (value as Adapter).build === 'function'
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
    case 'deno':
      return denoAdapter()
    default:
      throw new Error(`[Pyreon] Unknown adapter: "${String(value)}". Use "node", "bun", "static", "vercel", "cloudflare", "netlify", or "deno".`)
  }
}
