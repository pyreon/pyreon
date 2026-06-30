/**
 * Pure formatters for the perf-advisor's two output surfaces: the build
 * console report and the machine-readable JSON artifact.
 */
import type { RouteAdvisorResult } from './checks'

/** Severity glyphs (no color — the caller can wrap if a TTY). */
const GLYPH: Record<string, string> = { warn: '⚠', info: 'ℹ' }

/**
 * Render the per-route findings as a console block. Returns '' when there
 * are no findings (so a clean build stays silent). Deterministic.
 */
export function formatAdvisorReport(results: readonly RouteAdvisorResult[]): string {
  if (results.length === 0) return ''
  const lines: string[] = ['⚡ Pyreon perf advisor']
  for (const r of results) {
    lines.push(`  ${r.path}`)
    for (const f of r.findings) {
      lines.push(`    ${GLYPH[f.severity] ?? '·'} ${f.check}: ${f.message}`)
      lines.push(`        fix: ${f.fix}`)
    }
  }
  const total = results.reduce((n, r) => n + r.findings.length, 0)
  lines.push(`  ${total} finding${total === 1 ? '' : 's'} across ${results.length} route${results.length === 1 ? '' : 's'} (advisory — does not fail the build)`)
  return lines.join('\n')
}

/** The JSON artifact shape written to `dist/_pyreon-perf-advisor.json`. */
export interface AdvisorArtifact {
  routes: RouteAdvisorResult[]
}

export function buildAdvisorArtifact(results: readonly RouteAdvisorResult[]): AdvisorArtifact {
  return { routes: [...results] }
}
