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


// ─── routeRules — central glob overrides ─────────────────────────────────────

/**
 * Central per-path mode overrides (Nuxt's routeRules idiom, scoped v1:
 * renderMode only). Keys are path globs: `*` matches exactly one segment,
 * `**` matches any depth (including zero segments). Values apply to every
 * matching route that does NOT declare its own `renderMode` (route-file
 * declarations are closest to the code and always win):
 *
 *   route-file `export const renderMode` > routeRules > app mode.
 *
 * Matching is most-specific-first and deterministic: exact keys beat
 * wildcard keys; among wildcards, more segments beat fewer; `*` beats `**`
 * at equal segment count.
 */
export type RouteRules = Record<string, { renderMode?: RenderMode }>

/** One segment (`*`) / any-depth (`**`) glob match against a path. Pure. */
export function matchesRouteGlob(glob: string, path: string): boolean {
  const g = glob.split('/').filter(Boolean)
  const p = path.split('/').filter(Boolean)
  const walk = (gi: number, pi: number): boolean => {
    if (gi === g.length) return pi === p.length
    const seg = g[gi] as string
    if (seg === '**') {
      // any depth including zero
      for (let skip = pi; skip <= p.length; skip++) {
        if (walk(gi + 1, skip)) return true
      }
      return false
    }
    if (pi >= p.length) return false
    if (seg === '*' || seg === p[pi]) return walk(gi + 1, pi + 1)
    // A route-pattern param segment (`:slug`) is a concrete segment for
    // matching purposes — only wildcards match it.
    return false
  }
  return walk(0, 0)
}

/** Specificity sort: exact > more segments > `*` over `**`. Pure. */
function ruleSpecificity(glob: string): number {
  const segs = glob.split('/').filter(Boolean)
  let score = segs.length * 100
  for (const s of segs) {
    if (s === '**') score -= 50
    else if (s === '*') score -= 10
  }
  return score
}

/**
 * Resolve the most-specific matching rule's renderMode for a path (or a
 * route URL pattern — `:param` segments only match wildcards). Undefined
 * when no rule matches or the matching rules carry no renderMode.
 */
export function matchRouteRules(
  rules: RouteRules | undefined,
  path: string,
): RenderMode | undefined {
  if (!rules) return undefined
  const keys = Object.keys(rules).sort((a, b) => ruleSpecificity(b) - ruleSpecificity(a))
  for (const key of keys) {
    if (matchesRouteGlob(key, path)) {
      const mode = rules[key]?.renderMode
      if (mode !== undefined) return mode
    }
  }
  return undefined
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
  rules?: RouteRules,
): RenderMode {
  const resolved = resolveRoute(path, routes)
  const matched = resolved?.matched ?? []
  for (let i = matched.length - 1; i >= 0; i--) {
    const mode = recordRenderMode(matched[i] as RouteRecord)
    if (mode !== undefined) return mode
  }
  // Central overrides sit between the file declaration and the app mode:
  // file (closest to the code) > routeRules > app default.
  return matchRouteRules(rules, path) ?? appMode
}

/** One enumerated page route with its effective mode (build-time walk). */
export interface RouteModeEntry {
  /** URL pattern (`/posts/:id`), as emitted by fs-router. */
  pattern: string
  /** Effective render mode after layout cascade + app default. */
  mode: RenderMode
  /** True when the route itself (or an ancestor / a routeRule) DECLARED a mode. */
  declared: boolean
  /** Where the declaration came from — absent when the app default applied. */
  via?: 'file' | 'rule'
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
  rules?: RouteRules,
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
      const ruleMode = effective === undefined ? matchRouteRules(rules, path) : undefined
      out.push({
        pattern: path,
        mode: effective ?? ruleMode ?? appMode,
        declared: effective !== undefined || ruleMode !== undefined,
        ...(effective !== undefined
          ? { via: 'file' as const }
          : ruleMode !== undefined
            ? { via: 'rule' as const }
            : {}),
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
  // Each offender line carries its own one-line fix — the reader should be
  // able to paste the fix without reconstructing it from prose.
  const list = offenders
    .map((o) =>
      o.via === 'rule'
        ? `  ${o.pattern} (renderMode: '${o.mode}' via routeRules) → change or remove the matching zero({ routeRules }) entry`
        : `  ${o.pattern} (renderMode: '${o.mode}') → change to \`export const renderMode = '${appMode === 'ssg' ? 'ssg' : 'spa'}'\` in its route file, or remove the export`,
    )
    .join('\n')
  throw new Error(
    `[Pyreon] zero({ mode: '${appMode}' }) builds a static deploy with no server, but ${offenders.length} route(s) declare a server render mode:\n${list}\n` +
      `Or raise the app mode — zero({ mode: 'ssr' }) (or 'isr') emits a server bundle; per-route 'ssg'/'spa' declarations keep those routes static.`,
  )
}

// ─── Route-mode build table ──────────────────────────────────────────────────

/** Glyphs follow the convention the ecosystem reads at a glance. */
const MODE_GLYPH: Record<RenderMode, string> = {
  ssg: '○', // prerendered static
  ssr: 'λ', // server-rendered per request
  isr: '⟳', // static with revalidation
  spa: '⚡', // client-rendered shell
}

/**
 * Render the per-route mode table printed at build time (and by the dev
 * banner in verbose mode). Pure — no IO, unit-testable. Entries above
 * `maxRows` collapse to the counts line only (large apps keep short logs).
 */
export function formatRouteModeTable(
  entries: ReadonlyArray<{ pattern: string; mode: RenderMode; declared: boolean }>,
  appMode: RenderMode,
  maxRows = 40,
): string[] {
  if (entries.length === 0) return []
  const counts: Partial<Record<RenderMode, number>> = {}
  for (const e of entries) counts[e.mode] = (counts[e.mode] ?? 0) + 1
  const countsLine = (Object.entries(counts) as Array<[RenderMode, number]>)
    .sort(([, a], [, b]) => b - a)
    .map(([m, n]) => `${n} ${m} ${MODE_GLYPH[m]}`)
    .join(' · ')
  const lines: string[] = [`[zero] Route modes (app: ${appMode}) — ${countsLine}`]
  if (entries.length <= maxRows) {
    const sorted = [...entries].sort((a, b) => a.pattern.localeCompare(b.pattern))
    for (const e of sorted) {
      const marker = e.declared && e.mode !== appMode ? '  (declared)' : ''
      lines.push(`  ${MODE_GLYPH[e.mode]} ${e.mode.padEnd(3)}  ${e.pattern}${marker}`)
    }
  }
  return lines
}
