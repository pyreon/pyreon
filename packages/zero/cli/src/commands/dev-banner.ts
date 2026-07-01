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
// Color is a parameter, never assumed: `dev.ts` decides via NO_COLOR /
// FORCE_COLOR / isTTY and passes a boolean, so piped/CI output stays clean
// plain text instead of leaking raw SGR escapes.

// 8-bit-safe SGR opener codes (the CLI carries no color dependency — same
// convention as @pyreon/lint's reporter + `pyreon doctor`).
const RESET = '\x1b[0m'
type Colorizer = (s: string) => string
interface Style {
  cyan: Colorizer
  yellow: Colorizer
  green: Colorizer
  dim: Colorizer
  bold: Colorizer
}

function style(color: boolean): Style {
  const wrap = (open: string): Colorizer =>
    color ? (s) => `${open}${s}${RESET}` : (s) => s
  return {
    cyan: wrap('\x1b[36m'),
    yellow: wrap('\x1b[33m'),
    green: wrap('\x1b[32m'),
    dim: wrap('\x1b[2m'),
    bold: wrap('\x1b[1m'),
  }
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
export function formatRouteSummary(counts: RouteCounts, color = true): string {
  const c = style(color)
  const parts = Object.entries(counts.modes)
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([mode, n]) => `${mode} ${c.bold(String(n))}`)
  if (counts.api > 0) parts.push(`API ${c.bold(String(counts.api))}`)
  const body = parts.length > 0 ? parts.join(` ${c.dim('·')} `) : c.dim('none')
  return `  ${c.cyan('Routes')}  ${body}   ${c.dim('zero dev --routes to list')}`
}

/** The full, expanded route table (one line per route) — used with `--routes`. */
export function formatRouteTable(
  pages: readonly RouteSummaryInput[],
  apiPatterns: readonly string[],
  color = true,
): string[] {
  const c = style(color)
  const lines: string[] = ['', `  ${c.cyan(' Routes')}`, '']
  for (const r of pages) {
    lines.push(`  ${c.dim(r.renderMode.toUpperCase().padEnd(4))} ${r.urlPath}`)
  }
  if (apiPatterns.length > 0) {
    lines.push('', `  ${c.yellow(' API Routes')}`, '')
    for (const p of apiPatterns) lines.push(`  ${c.dim('API ')} ${p}`)
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
  opts: { verbose: boolean; color?: boolean },
): string[] {
  if (pages.length === 0 && apiPatterns.length === 0) return []
  const color = opts.color ?? true
  if (opts.verbose) return formatRouteTable(pages, apiPatterns, color)
  return ['', formatRouteSummary(countRoutes(pages, apiPatterns.length), color)]
}

/** The closing `➜  ready in 234ms` line — printed last, in the visible tail. */
export function formatReadyLine(readyMs: number, color = true): string {
  const c = style(color)
  return `  ${c.green('➜')}  ${c.dim('ready in')} ${c.bold(`${readyMs}ms`)}`
}
