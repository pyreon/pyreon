/**
 * Route-level render modes (Phase 2 of the render-modes plan).
 *
 * `export const renderMode = 'ssg' | 'ssr' | 'spa' | 'isr'` on a route file
 * has been typed + scanned since the fs-router's inception and lands on the
 * generated route record as `meta.renderMode` — but until Phase 2 NOTHING in
 * the pipeline read it (the typed-but-unimplemented class). This module is
 * the single source of truth for resolving a route's EFFECTIVE render mode:
 *
 *   effective(route) = nearest matched record with `meta.renderMode`
 *                      (leaf wins over layouts) ?? the app-level `mode`
 *
 * The app-level `zero({ mode })` therefore becomes the DEFAULT for routes
 * that don't declare one — existing apps keep working byte-identically —
 * while any route can opt out: an `'ssg'` route inside an `'ssr'` app is
 * prerendered at build + served static-first; an `'isr'` route gets the
 * SWR cache; an `'spa'` route ships the CSR shell with no server render.
 *
 * Layouts may declare `renderMode` too — it cascades to descendants that
 * don't declare their own (route-rules ergonomics: mark a whole `/blog`
 * subtree `'ssg'` on its layout).
 */
import type { RouteRecord } from '@pyreon/router'
import { resolveRoute } from '@pyreon/router'
import type { RenderMode } from './types'

const RENDER_MODES: ReadonlySet<string> = new Set(['ssr', 'ssg', 'spa', 'isr'])

function recordRenderMode(record: RouteRecord): RenderMode | undefined {
  const meta = (record as { meta?: { renderMode?: unknown } }).meta
  const value = meta?.renderMode
  return typeof value === 'string' && RENDER_MODES.has(value)
    ? (value as RenderMode)
    : undefined
}

/**
 * Resolve the effective render mode for a concrete path against the route
 * tree. Walks the matched chain LEAF-FIRST so a page's own `renderMode`
 * beats its layout's, and a layout's beats the app default.
 *
 * Unmatched paths (and the synthetic 404 chain) resolve to the app default
 * — not-found handling is mode-agnostic.
 */
export function resolveRenderModeForPath(
  routes: RouteRecord[],
  path: string,
  appMode: RenderMode,
): RenderMode {
  const resolved = resolveRoute(path, routes)
  const matched = resolved?.matched ?? []
  for (let i = matched.length - 1; i >= 0; i--) {
    const mode = recordRenderMode(matched[i] as RouteRecord)
    if (mode !== undefined) return mode
  }
  return appMode
}

/** One enumerated page route with its effective mode (build-time walk). */
export interface RouteModeEntry {
  /** URL pattern (`/posts/:id`), as emitted by fs-router. */
  pattern: string
  /** Effective render mode after layout cascade + app default. */
  mode: RenderMode
  /** True when the route itself (or an ancestor) DECLARED a mode. */
  declared: boolean
}

/**
 * Walk the route tree and classify every PAGE route (records that render a
 * leaf — anything with a `path`; layout records cascade their declared mode
 * to descendants but are not themselves entries unless they have no
 * children). Used by the build to decide which patterns join the prerender
 * pass and by `verify-modes`-style assertions.
 */
export function collectRouteModes(
  routes: RouteRecord[],
  appMode: RenderMode,
): RouteModeEntry[] {
  const out: RouteModeEntry[] = []
  const walk = (records: RouteRecord[], inherited: RenderMode | undefined): void => {
    for (const record of records) {
      const own = recordRenderMode(record)
      const effective = own ?? inherited
      const children = (record as { children?: RouteRecord[] }).children
      if (Array.isArray(children) && children.length > 0) {
        walk(children, effective)
        continue
      }
      const path = (record as { path?: string }).path
      if (typeof path !== 'string') continue
      out.push({
        pattern: path,
        mode: effective ?? appMode,
        declared: effective !== undefined,
      })
    }
  }
  walk(routes, undefined)
  return out
}

/**
 * Build-time validation: combinations the CURRENT build cannot honor fail
 * LOUDLY instead of silently producing a broken deploy.
 *
 * In `mode: 'ssg'` (static deploy — no server exists), a route declaring
 * `'ssr'` or `'isr'` is unimplementable: there is nothing to render it at
 * request time. The honest v1 is a build error naming the route + the fix
 * (raise the app mode to 'ssr'/'isr', or change the route's mode). The
 * "derive a server bundle from route declarations" end-state is a later
 * phase — erroring is strictly better than a 404 the user discovers in
 * production.
 */
export function assertModesSupported(
  entries: RouteModeEntry[],
  appMode: RenderMode,
): void {
  if (appMode !== 'ssg' && appMode !== 'spa') return
  const offenders = entries.filter(
    (e) => e.declared && (e.mode === 'ssr' || e.mode === 'isr'),
  )
  if (offenders.length === 0) return
  const list = offenders.map((o) => `  ${o.pattern} (renderMode: '${o.mode}')`).join('\n')
  throw new Error(
    `[Pyreon] zero({ mode: '${appMode}' }) builds a static deploy with no server, but ${offenders.length} route(s) declare a server render mode:\n${list}\n` +
      `Fix: set zero({ mode: 'ssr' }) (or 'isr') so a server bundle is emitted — per-route 'ssg'/'spa' declarations keep those routes static — or change the offending route's renderMode.`,
  )
}
