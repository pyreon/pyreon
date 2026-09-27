import type { Adapter } from '../types'
import type { ParsedCron } from './cron'

/**
 * Per-route deploy metadata read from route files at BUILD time:
 *
 *   `export const runtime = 'edge' | 'nodejs'`  (page or API route)
 *   `export const schedule = '0 * * * *'`       (API route only)
 *
 * Neither reaches the generated routes module — they describe where and when
 * the platform should run a route, which only the deploy adapter can act on.
 */

/** Where a route's server work runs. `'nodejs'` is the default. */
export type RouteRuntime = 'edge' | 'nodejs'

export interface ScheduledRoute {
  /** URL path the platform's cron calls with `GET` (e.g. `/api/cleanup`). */
  readonly path: string
  /** Normalised 5-field cron expression. */
  readonly schedule: string
  readonly cron: ParsedCron
  /** Route file, relative to the routes dir — for error messages. */
  readonly file: string
}

export interface DeployTargets {
  /** URL patterns (`/posts/:id`, `/docs/:rest*`) whose route declares `runtime = 'edge'`. */
  readonly edgeRoutes: readonly { pattern: string; file: string }[]
  /** Routes that explicitly declare `runtime = 'nodejs'` — honoured when the adapter defaults to edge. */
  readonly nodeRoutes: readonly { pattern: string; file: string }[]
  readonly schedules: readonly ScheduledRoute[]
}

export const EMPTY_DEPLOY_TARGETS: DeployTargets = Object.freeze({
  edgeRoutes: Object.freeze([]) as readonly never[],
  nodeRoutes: Object.freeze([]) as readonly never[],
  schedules: Object.freeze([]) as readonly never[],
})

/**
 * `/posts/:id` → an anchored regex (`^/posts/[^/]+/?$`) — used verbatim as a
 * Vercel route `src` and a Netlify edge-function `pattern`, so both platforms
 * route exactly the URLs the zero router would match to that file.
 */
export function patternToRegex(pattern: string): string {
  const parts = pattern.split('/').filter(Boolean).map((seg) => {
    if (/^:\w[\w-]*\*$/.test(seg)) return '(?:.*)'
    if (seg.startsWith(':')) return '[^/]+'
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
  if (parts.length === 0) return '^/$'
  const last = parts.at(-1)
  // A trailing catch-all also matches the bare parent (`/docs`).
  if (last === '(?:.*)') {
    const prefix = parts.slice(0, -1).join('/')
    return prefix ? `^/${prefix}(?:/.*)?$` : '^/.*$'
  }
  return `^/${parts.join('/')}/?$`
}

export { EDGE_SERVER_SUBDIR } from './contract'

/** Whether the SSR plugin must build the edge bundle for this adapter + app. */
export function needsEdgeBundle(adapter: Adapter, deploy: DeployTargets): boolean {
  const caps = adapter.capabilities
  if (caps?.edgeOnly) return true
  return caps?.edgeRoutes === true && deploy.edgeRoutes.length > 0
}

/**
 * Fail the build — with the offending files and the fix — when the app
 * declares something the adapter cannot deploy.
 */
export function checkDeployCapabilities(adapter: Adapter, deploy: DeployTargets): void {
  const caps = adapter.capabilities ?? {}
  if (deploy.edgeRoutes.length > 0 && !caps.edgeRoutes && !caps.edgeOnly) {
    throw new Error(
      `[Pyreon] The "${adapter.name}" adapter has no edge runtime, but these routes declare \`export const runtime = 'edge'\`: ${deploy.edgeRoutes.map((r) => r.file).join(', ')}. Deploy with vercelAdapter(), netlifyAdapter(), denoAdapter() or cloudflareAdapter(), or remove the export (the route then runs on ${adapter.name}).`,
    )
  }
  if (caps.edgeOnly && !caps.nodeRoutes && deploy.nodeRoutes.length > 0) {
    throw new Error(
      `[Pyreon] The "${adapter.name}" adapter runs every route on its edge runtime, but these routes declare \`export const runtime = 'nodejs'\`: ${deploy.nodeRoutes.map((r) => r.file).join(', ')}. Remove the export (and any Node-only API the route uses), or deploy with an adapter that has a Node runtime.`,
    )
  }
  if (deploy.schedules.length > 0 && !caps.schedules) {
    const hint =
      adapter.name === 'node' || adapter.name === 'bun'
        ? `Opt in to the in-process scheduler with ${adapter.name}Adapter({ scheduler: true }).`
        : adapter.name === 'cloudflare'
          ? 'Cloudflare Pages has no cron triggers (they exist only on Workers) — trigger the route from a separate Worker with a [triggers] crons entry, or deploy with another adapter.'
          : 'Deploy with an adapter that supports scheduled routes (vercel, netlify, node/bun with scheduler: true).'
    throw new Error(
      `[Pyreon] The "${adapter.name}" adapter cannot run \`export const schedule\` on ${deploy.schedules.map((s) => s.file).join(', ')}. ${hint}`,
    )
  }
}
