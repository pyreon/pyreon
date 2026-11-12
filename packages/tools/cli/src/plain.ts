/**
 * `pyreon plain [paths...]` — Plain-Mode readiness report + classic → plain
 * codemod (`--write`).
 *
 * Dry-run (default) is the READINESS REPORT the Plain Mode RFC promised:
 * per-file — compiles clean under plain / converts fully / partial with
 * every declined shape NAMED / nothing to convert — plus a declined-shape
 * histogram, so a team sees the cost of migration before committing to it,
 * and the histogram tells the compiler team which rewrite to build next
 * from field data.
 *
 * `--write` applies `@pyreon/compiler`'s `migrateToPlain` in place. Safety
 * is per-BINDING by construction: a binding converts only when EVERY
 * reference has a plain form; everything else stays byte-untouched with a
 * named reason. Object/array-literal signals become `state.raw(...)` —
 * the codemod never changes semantics (deep state is a human opt-in).
 *
 * With no path args it scans the whole tree under cwd (a readiness report
 * is a project-level question — unlike `pyreon check`, whose no-arg default
 * is git-changed files).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  columns,
  createTerm,
  finding as findingLines,
  formatElapsed,
  header,
  nothingTo,
  plural,
  type Term,
  verdict,
  wrap,
} from '@pyreon/ansi'

export interface PlainOptions {
  paths: string[]
  cwd: string
  json: boolean
  write: boolean
  /**
   * Include test/spec files found while walking a directory. Off by default:
   * Plain Mode only works in files the Pyreon compiler processes, and test
   * runners are commonly configured WITHOUT the `pyreon()` plugin — a
   * converted test would throw the markers' did-not-compile error. A test
   * file named EXPLICITLY on the command line is always included.
   */
  includeTests?: boolean
}

const SKIP_DIR = /(?:^|\/)(?:node_modules|lib|dist|build|\.git|coverage)(?:\/|$)/
const isSource = (f: string): boolean => /\.(?:tsx?|jsx?)$/.test(f) && !f.endsWith('.d.ts')
/** Test/spec code — the conventions this repo and common setups use. */
export const isTestFile = (f: string): boolean =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f) || /(?:^|[/\\])(?:__tests__|tests|e2e)[/\\]/.test(f)


function expandPath(p: string, cwd: string, includeTests: boolean, skipped: { tests: number }): string[] {
  const abs = isAbsolute(p) ? p : resolve(cwd, p)
  let st
  try {
    st = statSync(abs)
  } catch {
    return []
  }
  if (st.isFile()) return isSource(abs) ? [abs] : []
  if (!st.isDirectory()) return []
  const out: string[] = []
  const walk = (dir: string): void => {
    if (SKIP_DIR.test(dir)) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let s
      try {
        s = statSync(full)
      } catch {
        continue
      }
      if (s.isDirectory()) walk(full)
      else if (s.isFile() && isSource(full)) {
        if (!includeTests && isTestFile(full)) skipped.tests++
        else out.push(full)
      }
    }
  }
  walk(abs)
  return out
}

export type FileStatus = 'already-plain' | 'full' | 'partial' | 'declined' | 'nothing'

export interface FileReport {
  file: string
  status: FileStatus
  converted: string[]
  declined: Array<{ name: string; code: string; reason: string; line: number; column: number }>
  written: boolean
}

export async function plain(opts: PlainOptions): Promise<number> {
  const { migrateToPlain } = await import('@pyreon/compiler')
  const started = performance.now()

  const includeTests = opts.includeTests === true
  const skipped = { tests: 0 }
  const targets =
    opts.paths.length > 0
      ? [...new Set(opts.paths.flatMap((p) => expandPath(p, opts.cwd, includeTests, skipped)))]
      : expandPath(opts.cwd, opts.cwd, includeTests, skipped)

  if (targets.length === 0) {
    // `--json` must ALWAYS emit JSON. Printing prose on this branch
    // hands a parser `No source files matched.` and it throws — the one
    // consumer the flag exists for is the one that breaks.
    if (opts.json) {
      console.log(JSON.stringify({ files: [], declined: {}, matched: 0 }, null, 2))
      return 0
    }
    console.log(nothingTo(createTerm(), 'No source files matched', 'pass a file or directory: pyreon plain src/'))
    return 0
  }

  const reports: FileReport[] = []
  for (const abs of targets) {
    let code: string
    try {
      code = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const rel = relative(opts.cwd, abs)
    const r = migrateToPlain(code, abs)
    let status: FileStatus
    if (r.alreadyPlain) status = 'already-plain'
    else if (r.converted.length > 0 && r.declined.length === 0) status = 'full'
    else if (r.converted.length > 0) status = 'partial'
    else if (r.declined.length > 0) status = 'declined'
    else status = 'nothing'

    let written = false
    if (opts.write && r.code !== null) {
      writeFileSync(abs, r.code)
      written = true
    }
    reports.push({ file: rel, status, converted: r.converted, declined: r.declined, written })
  }

  const by = (s: FileStatus) => reports.filter((r) => r.status === s)
  const histogram = new Map<string, number>()
  for (const r of reports) {
    for (const d of r.declined) histogram.set(d.code, (histogram.get(d.code) ?? 0) + 1)
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          files: reports.filter((r) => r.status !== 'nothing'),
          summary: {
            scanned: reports.length,
            alreadyPlain: by('already-plain').length,
            full: by('full').length,
            partial: by('partial').length,
            declined: by('declined').length,
            nothing: by('nothing').length,
            written: reports.filter((r) => r.written).length,
            skippedTests: skipped.tests,
          },
          declinedHistogram: Object.fromEntries(histogram),
        },
        null,
        2,
      ),
    )
    return 0
  }

  console.log(
    renderPlainText(createTerm(), {
      reports,
      skippedTests: skipped.tests,
      histogram,
      write: opts.write,
      paths: opts.paths,
      cwd: opts.cwd,
      elapsedMs: performance.now() - started,
    }),
  )
  return 0
}

/** What `renderPlainText` needs: the scan's result, not its IO. */
export interface PlainRun {
  reports: readonly FileReport[]
  skippedTests: number
  histogram: ReadonlyMap<string, number>
  write: boolean
  paths: readonly string[]
  cwd: string
  elapsedMs: number
}

const statusCell = (t: Term, r: FileReport): string => {
  const n = r.converted.length
  if (r.status === 'already-plain') return `${t.ok(t.sym('ok'))} already plain`
  if (r.status === 'full') return `${t.ok(t.sym('ok'))} converts fully ${t.dim(`${t.sym('bullet')} ${plural(n, 'binding')}`)}`
  if (r.status === 'partial') {
    return `${t.warn(t.sym('warn'))} partial ${t.dim(`${t.sym('bullet')} ${n} convert, ${r.declined.length} declined`)}`
  }
  return `${t.warn(t.sym('warn'))} declined ${t.dim(`${t.sym('bullet')} ${r.declined.length}`)}`
}

/**
 * The readiness report: header, one row per file with something to say
 * (status as symbol + word, `→ written` when `--write` changed it), each
 * declined shape as a finding under its file, the declined-shape histogram,
 * then the verdict.
 */
export function renderPlainText(t: Term, run: PlainRun): string {
  const shown = run.reports.filter((r) => r.status !== 'nothing')
  const count = (s: FileStatus): number => run.reports.filter((r) => r.status === s).length
  const lines = [header(t, 'pyreon plain', `Plain Mode readiness ${t.sym('bullet')} ${plural(run.reports.length, 'file')}`)]

  if (shown.length > 0) {
    lines.push('')
    const rows = shown.map((r) => [
      t.underline(r.file),
      statusCell(t, r),
      r.written ? t.ok(`${t.sym('arrow')} written`) : '',
    ])
    const rowLines = columns(rows, { width: t.width })
    // A stacked table emits two lines per row; keep each row's lines together.
    const per = rowLines.length / shown.length
    shown.forEach((r, i) => {
      lines.push(...rowLines.slice(i * per, (i + 1) * per))
      for (const d of r.declined) {
        lines.push(
          ...findingLines(
            t,
            {
              severity: 'warning',
              source: d.code,
              message: `${d.name ? `${d.name}: ` : ''}${d.reason}`,
              location: { path: r.file, abs: resolve(run.cwd, r.file), line: d.line, column: d.column },
            },
            { indent: 4, width: t.width },
          ),
        )
      }
    })
  }

  if (run.histogram.size > 0) {
    lines.push('', `  ${t.bold('Declined shapes')} ${t.dim('(build-next histogram)')}`)
    const sorted = [...run.histogram.entries()].sort((a, b) => b[1] - a[1])
    lines.push(...columns(sorted.map(([code, n]) => [code, String(n)]), { align: ['left', 'right'], indent: 4 }))
  }

  if (run.skippedTests > 0) {
    const note = `${plural(run.skippedTests, 'test file')} skipped ${t.sym('dash')} Plain Mode needs the pyreon() plugin, which test runners often lack. Pass --include-tests if yours has it.`
    const wrapped = wrap(note, t.width, t.width - 4, '    ')
    lines.push('', `  ${t.info(t.sym('info'))} ${wrapped[0] ?? ''}`, ...wrapped.slice(1))
  }

  const convertible = count('full') + count('partial')
  if (!run.write && convertible > 0) {
    lines.push('', `  ${t.dim('next:')} pyreon plain${run.paths.length ? ` ${run.paths.join(' ')}` : ''} --write ${t.dim('to apply')}`)
  }

  const declined = count('declined')
  const written = run.reports.filter((r) => r.written).length
  lines.push(
    '',
    verdict(t, declined > 0 ? 'warn' : 'ok', `${plural(run.reports.length, 'file')} scanned`, [
      `${count('already-plain')} already plain`,
      `${convertible} convertible`,
      `${declined} declined`,
      `${count('nothing')} nothing to convert`,
      written > 0 && `${written} written`,
      formatElapsed(run.elapsedMs),
    ]),
  )
  return lines.join('\n')
}
