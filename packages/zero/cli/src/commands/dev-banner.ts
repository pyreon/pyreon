// Pure formatters for the `zero dev` startup banner. Kept IO-free (no console,
// no fs, no Vite) so they're unit-testable — `dev.ts` does the scanning +
// printing and delegates every rendered line to these functions.
//
// Why a COLLAPSED summary by default: `zero dev` is commonly run under
// `bun run --filter <app> dev`, whose runner boxes child output and elides the
// MIDDLE of long stdout ("N lines elided"), keeping only the tail. A full route
// table (dozens of lines) pushes the Local URL + ready-time — the two things
// you actually need — into the elided region. A one-line summary keeps the
// whole banner short so nothing is elided; `--routes` opts into the full table.

// The CLI carries no color dependency (same convention as @pyreon/lint's
// reporter + `pyreon doctor`) — 8-bit-safe SGR literals, emitted raw like the
// rest of the dev banner + Vite's own printUrls.
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

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
 * is deterministic.
 */
export function formatRouteSummary(counts: RouteCounts): string {
  const parts = Object.entries(counts.modes)
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([mode, n]) => `${mode} ${BOLD}${n}${RESET}`)
  if (counts.api > 0) parts.push(`API ${BOLD}${counts.api}${RESET}`)
  const body = parts.length > 0 ? parts.join(` ${DIM}·${RESET} `) : `${DIM}none${RESET}`
  return `  ${CYAN}Routes${RESET}  ${body}   ${DIM}zero dev --routes to list${RESET}`
}

/** The full, expanded route table (one line per route) — used with `--routes`. */
export function formatRouteTable(
  pages: readonly RouteSummaryInput[],
  apiPatterns: readonly string[],
): string[] {
  const lines: string[] = ['', `  ${CYAN} Routes${RESET}`, '']
  for (const r of pages) {
    lines.push(`  ${DIM}${r.renderMode.toUpperCase().padEnd(4)}${RESET} ${r.urlPath}`)
  }
  if (apiPatterns.length > 0) {
    lines.push('', `  ${YELLOW} API Routes${RESET}`, '')
    for (const p of apiPatterns) lines.push(`  ${DIM}API ${RESET} ${p}`)
  }
  return lines
}

/** The closing `➜  ready in 234ms` line — printed last, in the visible tail. */
export function formatReadyLine(readyMs: number): string {
  return `  ${GREEN}➜${RESET}  ${DIM}ready in${RESET} ${BOLD}${readyMs}ms${RESET}`
}
