/**
 * `loom scan`'s human output, in the shared Pyreon terminal look
 * (`@pyreon/ansi`). Pure over (report, options), so every colour level, both
 * backgrounds and the ASCII fallback are snapshot-testable.
 *
 * Layout (the six CLI rules): what ran, the fabric's numbers in an aligned
 * column, the findings grouped by severity — info first, errors last, so the
 * ones that fail the run sit next to the verdict — and the verdict line with
 * counts and the measured elapsed time. `--json` is a separate channel and
 * never passes through here.
 */
import {
  columns,
  createTerm,
  finding,
  formatCounts,
  formatElapsed,
  header,
  type Location,
  plural,
  severityStyle,
  type Term,
  verdict,
  WRAP_WIDTH,
} from '@pyreon/ansi'
import type { LoomIssue, LoomReport } from '../core/types'

export interface ScanTextOptions {
  /** The directory as the user gave it. */
  dir: string
  /** `--strict` (flag or config): warnings fail the run too. */
  strict: boolean
  /** Where `loom-report.json` was written; absent under `--no-write`. */
  reportPath?: string | undefined
  /** Wall-clock time of the scan, measured by the caller. */
  elapsedMs?: number | undefined
  /** 0 plain, 1 sixteen colours, 2 256 colours, 3 truecolor. Detected from stdout when left out. */
  color?: 0 | 1 | 2 | 3 | undefined
  theme?: 'dark' | 'light' | undefined
  unicode?: boolean | undefined
  width?: number | undefined
}

/** How many of a finding's locations to name before counting the rest. */
const MAX_LOCATIONS = 3

const filesOf = (issue: LoomIssue): string[] => {
  const files = issue.details?.files
  return Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : []
}

function issueLines(t: Term, issue: LoomIssue, pkgDirs: ReadonlyMap<string, string>, width: number): string[] {
  const dirOf = (pkg: string): string | undefined => {
    const dir = pkg === 'ROOT' ? '' : pkgDirs.get(pkg)
    return dir === undefined ? undefined : dir === '' || dir === '.' ? '' : `${dir}/`
  }
  const manifest = (pkg: string): Location | undefined => {
    const dir = dirOf(pkg)
    return dir === undefined ? undefined : { path: `${dir}package.json` }
  }
  // Where to look. The importing files when the finding has them
  // (`packages/app/src/index.ts`); for version drift, each declaring
  // manifest with the range it declares; otherwise the manifest of the
  // package the finding is attributed to.
  let locations: Array<Location & { label?: string }> = []
  const files = filesOf(issue)
  const ranges = issue.details?.ranges
  if (files.length > 0) {
    const dir = dirOf(issue.pkg) ?? ''
    locations = files.map((f) => ({ path: `${dir}${f}` }))
  } else if (issue.code === 'version-drift' && ranges && typeof ranges === 'object') {
    for (const [range, users] of Object.entries(ranges as Record<string, unknown>)) {
      if (!Array.isArray(users)) continue
      for (const user of users) {
        const at = typeof user === 'string' ? manifest(user) : undefined
        if (at) locations.push({ ...at, label: range })
      }
    }
  } else {
    const at = manifest(issue.pkg)
    if (at) locations = [at]
  }
  const shown = locations.slice(0, MAX_LOCATIONS)
  const lines = finding(
    t,
    // `related` lines carry a label (the declared range); `location` cannot.
    shown.some((l) => l.label)
      ? { severity: issue.severity, source: issue.code, message: issue.message, related: shown }
      : { severity: issue.severity, source: issue.code, message: issue.message, location: shown[0], related: shown.slice(1) },
    { indent: 2, width },
  )
  if (locations.length > MAX_LOCATIONS) {
    lines.push(`     ${t.dim(`… and ${locations.length - MAX_LOCATIONS} more (loom-report.json lists all)`)}`)
  }
  return lines
}

export function renderScanText(report: LoomReport, opts: ScanTextOptions): string {
  const t = createTerm({
    ...(opts.color !== undefined ? { level: opts.color } : {}),
    theme: opts.theme,
    unicode: opts.unicode,
  })
  const width = opts.width ?? WRAP_WIDTH
  const s = report.stats
  const lines = [header(t, 'loom scan', `${opts.dir} ${t.sym('bullet')} ${plural(s.internal, 'package')}`), '']

  // Rule 2: labels padded, numbers right-aligned.
  lines.push(
    ...columns(
      [
        ['workspace packages', String(s.internal)],
        ['external deps', String(s.external)],
        ['internal edges', String(s.edges)],
        ['depth', String(s.depth)],
        ['runtime cycles', s.cycles > 0 ? t.err(String(s.cycles)) : String(s.cycles)],
      ].map(([label, n]) => [t.dim(label as string), n as string]),
      { align: ['left', 'right'] },
    ),
  )

  const pkgDirs = new Map(report.model.packages.map((p) => [p.name, p.dir]))
  for (const sev of ['info', 'warning', 'error'] as const) {
    const list = report.issues.filter((i) => i.severity === sev)
    if (list.length === 0) continue
    const style = severityStyle(sev)
    const count = sev === 'info' ? `${list.length} info` : plural(list.length, style.word)
    lines.push('', `  ${t.paint(style.role, t.bold(`${t.sym(style.symbol)} ${count}`))}`)
    for (const issue of list) lines.push(...issueLines(t, issue, pkgDirs, width))
  }

  if (opts.reportPath) lines.push('', `  ${t.dim('report')}  ${t.info(opts.reportPath)}`)

  const red = s.errors > 0 || (opts.strict && s.warnings > 0)
  const counts = formatCounts(t, { errors: s.errors, warnings: s.warnings, infos: s.infos })
  const meta = [
    opts.strict ? 'strict' : undefined,
    plural(s.internal, 'package'),
    opts.elapsedMs === undefined ? undefined : formatElapsed(opts.elapsedMs),
  ]
  lines.push('')
  if (report.issues.length === 0) lines.push(verdict(t, 'ok', 'fabric clean', meta))
  else if (red) lines.push(verdict(t, 'err', counts, meta))
  else if (s.warnings > 0) lines.push(verdict(t, 'warn', counts, meta))
  else lines.push(verdict(t, 'ok', 'no errors or warnings', [counts, ...meta]))
  return `${lines.join('\n')}\n`
}
