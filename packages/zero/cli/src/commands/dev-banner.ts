// Pure formatters for the `zero dev` startup banner. Kept IO-free (no console,
// no fs, no Vite, no `process`) so they're unit-testable — `dev.ts` does the
// scanning + printing and delegates every rendered line to these functions.
//
// Why a COLLAPSED summary by default: `zero dev` is commonly run under
// `bun run --filter <app> dev`, whose runner boxes child output and elides the
// MIDDLE of long stdout ("N lines elided"), keeping only the tail. A full route
// table (dozens of lines) pushes the Local URL + ready-time — the two things
// you actually need — into the elided region. A one-line summary keeps the
// whole banner short so nothing is elided; `--routes` opts into the full table.
//
// Color is a parameter, never assumed: `dev.ts` passes the `Term` the shared
// `@pyreon/ansi` detection built for stdout (NO_COLOR, FORCE_COLOR, TERM,
// isTTY), so piped/CI output stays clean plain text.

import { createTerm, formatElapsed, header, type Term, verdict } from '@pyreon/ansi'

/**
 * The banner speaks the shared `@pyreon/ansi` theme. `color` is either a
 * ready `Term` (what `dev.ts` passes, detected once from stdout) or a
 * boolean for the pure formatters: `false` is plain, `true` is colour at
 * the detected level (16 colours at least).
 */
export type BannerColor = boolean | Term

const termOf = (color: BannerColor): Term => {
  if (typeof color !== 'boolean') return color
  if (!color) return createTerm({ level: 0 })
  const detected = createTerm()
  return detected.level > 0 ? detected : createTerm({ level: 1 })
}

/** Palette role per render mode: the same mapping as the build's route table. */
const MODE_ROLE = { SSR: 'accent', SSG: 'info', ISR: 'warn' } as const
const paintMode = (t: Term, mode: string, s: string): string => {
  const role = MODE_ROLE[mode.toUpperCase() as keyof typeof MODE_ROLE]
  return role === undefined ? s : t.paint(role, s)
}

/** Minimal shape the formatters read off a parsed page route. */
export interface RouteSummaryInput {
  urlPath: string
  renderMode: string
}

/** Per-mode + API counts, derived once and rendered into the summary line. */
export interface RouteCounts {
  /** Uppercased render mode (SSR/SSG/SPA/ISR) → number of page routes. */
  modes: Record<string, number>
  pages: number
  api: number
}

export function countRoutes(pages: readonly RouteSummaryInput[], apiCount: number): RouteCounts {
  const modes: Record<string, number> = {}
  for (const r of pages) {
    const m = r.renderMode.toUpperCase()
    modes[m] = (modes[m] ?? 0) + 1
  }
  return { modes, pages: pages.length, api: apiCount }
}

/**
 * The collapsed one-liner, e.g. `Routes  SSR 7 · SSG 4 · API 1   --routes to list`.
 * Modes are ordered by count (desc), ties broken alphabetically, so the output
 * is deterministic. `API 1` is only rendered when there are API routes.
 */
export function formatRouteSummary(counts: RouteCounts, color: BannerColor = true): string {
  const t = termOf(color)
  const sep = t.dim(t.sym('bullet'))
  const parts = Object.entries(counts.modes)
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([mode, n]) => `${paintMode(t, mode, mode)} ${t.bold(String(n))}`)
  if (counts.api > 0) parts.push(`API ${t.bold(String(counts.api))}`)
  const body = parts.length > 0 ? parts.join(` ${sep} `) : t.dim('none')
  return `  ${t.dim('Routes')}  ${body} ${t.dim(`${t.sym('bullet')} zero dev --routes to list`)}`
}

/** The full, expanded route table (one line per route) — used with `--routes`. */
export function formatRouteTable(
  pages: readonly RouteSummaryInput[],
  apiPatterns: readonly string[],
  color: BannerColor = true,
): string[] {
  const t = termOf(color)
  const lines: string[] = ['', `  ${t.bold('Routes')}`]
  for (const r of pages) {
    const mode = r.renderMode.toUpperCase()
    lines.push(`    ${paintMode(t, mode, mode.padEnd(4))} ${r.urlPath}`)
  }
  if (apiPatterns.length > 0) {
    lines.push('', `  ${t.bold('API Routes')}`)
    for (const p of apiPatterns) lines.push(`    ${t.dim('API ')} ${p}`)
  }
  return lines
}

/**
 * Decide the route-banner lines from the scanned routes: the full table under
 * `--routes`, otherwise the collapsed summary. Returns `[]` when there are no
 * routes at all (the dev server still starts — the caller just prints no
 * banner). Pure so the verbose/summary branch is unit-testable without booting
 * Vite.
 */
export function renderRouteBanner(
  pages: readonly RouteSummaryInput[],
  apiPatterns: readonly string[],
  opts: { verbose: boolean; color?: BannerColor; appMode?: string },
): string[] {
  if (pages.length === 0 && apiPatterns.length === 0) return []
  const color = opts.color ?? true
  const head = opts.appMode ? [formatModeLine(opts.appMode, pages, color)] : []
  if (opts.verbose) return ['', ...head, ...formatRouteTable(pages, apiPatterns, color)]
  return ['', ...head, formatRouteSummary(countRoutes(pages, apiPatterns.length), color)]
}

/**
 * The app-mode header line, e.g. `Mode    ssr` — or, when routes declare
 * modes that differ from the app default, `Mode    ssr (hybrid: 4 ssg, 1 isr)`
 * so a hybrid setup is visible before the first request is ever served.
 */
export function formatModeLine(
  appMode: string,
  pages: readonly RouteSummaryInput[],
  color: BannerColor = true,
): string {
  const t = termOf(color)
  const overrides: Record<string, number> = {}
  for (const r of pages) {
    const m = r.renderMode.toLowerCase()
    if (m !== appMode.toLowerCase()) overrides[m] = (overrides[m] ?? 0) + 1
  }
  const parts = Object.entries(overrides)
    .sort(([, a], [, b]) => b - a)
    .map(([m, n]) => `${n} ${m}`)
  const hybrid = parts.length > 0 ? ` ${t.dim(`(hybrid: ${parts.join(', ')})`)}` : ''
  return `  ${t.dim('Mode')}    ${paintMode(t, appMode, t.bold(appMode))}${hybrid}`
}

/** Rule 1, first line: `zero dev · <project dir>`. */
export function formatDevHeader(project: string, color: BannerColor = true): string {
  return header(termOf(color), 'zero dev', project)
}

/**
 * The closing verdict, `✓ ready in 234 ms`, printed last so it survives in
 * the visible tail of `bun run --filter`'s boxed output.
 */
export function formatReadyLine(readyMs: number, color: BannerColor = true): string {
  return verdict(termOf(color), 'ok', `ready in ${formatElapsed(readyMs)}`)
}
