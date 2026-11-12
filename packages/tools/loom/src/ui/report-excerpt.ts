/**
 * The manifest view's `loom-report.json` excerpt — the real shape of THIS
 * scan in a few lines: the headline counts, the gate, and the first findings
 * (the report sorts them errors first). Pure, so what the block claims is
 * testable against the report it summarises.
 */
import type { LoomReport } from '../core/types'

const q = (s: string) => JSON.stringify(s)

export function reportExcerpt(report: LoomReport, shown = 3): string {
  const s = report.stats
  const exit = report.gate?.exit ?? (s.errors > 0 ? 1 : 0)
  const lines = [
    `{ "packages": ${s.internal}, "external": ${s.external}, "edges": ${s.edges}, "maxDepth": ${s.depth}, "cycles": ${s.cycles},`,
    `  "gate": { "strict": ${report.gate?.strict === true}, "exit": ${exit} },`,
  ]
  if (report.issues.length === 0) {
    lines.push('  "issues": [] }')
    return lines.join('\n')
  }
  lines.push('  "issues": [')
  for (const i of report.issues.slice(0, shown)) {
    const parts = [`"code": ${q(i.code)}`, `"severity": ${q(i.severity)}`, `"pkg": ${q(i.pkg)}`]
    if (i.dep) parts.push(`"dep": ${q(i.dep)}`)
    lines.push(`    { ${parts.join(', ')} },`)
  }
  const rest = report.issues.length - shown
  if (rest > 0) lines.push(`    … ${rest} more`)
  lines.push('  ] }')
  return lines.join('\n')
}
