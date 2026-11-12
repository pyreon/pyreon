/**
 * Pure formatters for the perf-advisor's two output surfaces: the build
 * console report and the machine-readable JSON artifact.
 */
import { finding, header, plural, type Term, term as stdout, verdict } from '@pyreon/ansi'
import type { RouteAdvisorResult } from './checks'

/**
 * Render the per-route findings as a console block in the shared theme:
 * header, each finding as `! check · message` / `↳ route` / `fix:`, then
 * the verdict. Returns '' when there are no findings (so a clean build
 * stays silent). Deterministic for a given `Term` (default: stdout).
 */
export function formatAdvisorReport(
  results: readonly RouteAdvisorResult[],
  t: Term = stdout,
): string {
  if (results.length === 0) return ''
  const total = results.reduce((n, r) => n + r.findings.length, 0)
  const lines: string[] = [header(t, 'perf advisor', `${plural(results.length, 'route')} ${t.sym('bullet')} advisory`)]
  for (const r of results) {
    for (const f of r.findings) {
      lines.push(
        '',
        ...finding(
          t,
          {
            severity: f.severity === 'warn' ? 'warning' : 'info',
            source: f.check,
            message: f.message,
            location: { path: r.path },
            fix: f.fix,
          },
          { width: t.width },
        ),
      )
    }
  }
  const warnings = results.reduce((n, r) => n + r.findings.filter((f) => f.severity === 'warn').length, 0)
  lines.push(
    '',
    verdict(t, warnings > 0 ? 'warn' : 'info', `${plural(total, 'finding')} across ${plural(results.length, 'route')}`, [
      'advisory, does not fail the build',
    ]),
  )
  return lines.join('\n')
}

/** The JSON artifact shape written to `dist/_pyreon-perf-advisor.json`. */
export interface AdvisorArtifact {
  routes: RouteAdvisorResult[]
}

export function buildAdvisorArtifact(results: readonly RouteAdvisorResult[]): AdvisorArtifact {
  return { routes: [...results] }
}
