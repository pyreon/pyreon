/**
 * `atlas scan` / `atlas verify` human output, in the shared Pyreon terminal
 * look (`@pyreon/ansi`). Pure over (data, term), so every colour level, both
 * backgrounds and the ASCII fallback are snapshot-testable.
 *
 * Layout (the six CLI rules): the first line says what ran; the numbers sit
 * in a padded label column (`checks` and `not run` keep the documented
 * `formatCheckTally` / `formatNotRun` content); each failing scenario lists
 * its findings as `✗ check [code] · message`, `↳ source file`, `fix: …`;
 * the last line is the verdict with counts and the measured elapsed time.
 * `--json` never passes through here.
 */
import {
  createTerm,
  finding,
  formatElapsed,
  header,
  plural,
  type Term,
  verdict,
  visibleWidth,
  wrap,
  WRAP_WIDTH,
} from '@pyreon/ansi'
import type { FailingScenario, VerifyReport } from '../verify/report'
import { formatCheckTally, formatNotRun } from '../verify/report'

export interface TermChoice {
  /** 0 plain, 1 sixteen colours, 2 truecolor. Detected from the stream when left out. */
  color?: 0 | 1 | 2 | undefined
  theme?: 'dark' | 'light' | undefined
  unicode?: boolean | undefined
}

/** A `Term` for one output stream, or for explicit capabilities (tests). */
export function termFor(stream: 'stdout' | 'stderr', choice: TermChoice = {}): Term {
  return createTerm({
    ...(choice.color !== undefined ? { level: choice.color } : {}),
    theme: choice.theme,
    unicode: choice.unicode,
    isTTY: Boolean(stream === 'stdout' ? process.stdout?.isTTY : process.stderr?.isTTY),
  })
}

/** Rule 1, first line: `atlas scan · . · static`. */
export function commandHeader(t: Term, command: string, context: readonly string[]): string {
  const kept = context.filter((c) => c !== '')
  return header(t, command, kept.length > 0 ? kept.join(` ${t.sym('bullet')} `) : undefined)
}

/** `checks: a11y 12/14 ✗ · …` with the failing entries painted, and the ✗ in the term's symbol set. */
function paintTally(t: Term, tally: string): string {
  return tally
    .split(' · ')
    .map((entry) => (entry.endsWith(' ✗') ? t.err(`${entry.slice(0, -2)} ${t.sym('err')}`) : entry))
    .join(t.dim(` ${t.sym('bullet')} `))
}

export interface SummaryInput {
  /** Omitted by `verify`, whose header already names the component count. */
  components?: number | undefined
  report: Pick<VerifyReport, 'scenarios' | 'verified' | 'failed' | 'unverified' | 'tallies'>
  /** Files the scan wrote (catalog, agent guide). */
  wrote?: readonly string[] | undefined
  width?: number | undefined
}

/**
 * The numbers: components, scenarios by outcome, which checks ran and how
 * they fared, which did not run and why, and what was written.
 */
export function summaryLines(t: Term, input: SummaryInput): string[] {
  const width = input.width ?? WRAP_WIDTH
  const r = input.report
  const b = ` ${t.sym('bullet')} `
  const counted: Array<[string, number, string]> = []
  if (input.components !== undefined) counted.push(['components', input.components, ''])
  counted.push([
    'scenarios',
    r.scenarios,
    [r.failed > 0 ? t.err(`${r.failed} failing`) : `${r.failed} failing`, `${r.verified} verified`, `${r.unverified} unverified`].join(
      t.dim(b),
    ),
  ])
  const notRun = formatNotRun(r.tallies)
  const wrote = input.wrote ?? []
  // Rule 2: one label column, padded to the longest label shown; the counts
  // right-aligned in their own column.
  const labels = [...counted.map(([l]) => l), 'checks', ...(notRun.length > 0 ? ['not run'] : []), ...(wrote.length > 0 ? ['wrote'] : [])]
  const lw = Math.max(...labels.map((l) => l.length))
  const nw = Math.max(...counted.map(([, n]) => String(n).length))
  const indent = ' '.repeat(2 + lw + 2)
  const label = (l: string) => `  ${t.dim(l)}${' '.repeat(lw - l.length)}  `
  const lines = counted.map(([l, n, rest]) => `${label(l)}${String(n).padStart(nw)}${rest ? `  ${rest}` : ''}`)
  lines.push(`${label('checks')}${paintTally(t, formatCheckTally(r.tallies))}`)
  notRun.forEach((line, i) => {
    const text = wrap(line.replace(/^not run: /, ''), width, width - indent.length, indent)
    lines.push(`${i === 0 ? label('not run') : indent}${text[0] ?? ''}`, ...text.slice(1))
  })
  wrote.forEach((path, i) => lines.push(`${i === 0 ? label('wrote') : indent}${t.info(path)}`))
  return lines
}

export interface FailureOptions {
  /** How many failing scenarios to print in full; the rest are counted. */
  limit?: number | undefined
  /** The component source file for a scenario id, shown as the finding's location. */
  sourceOf?: ((scenarioId: string) => string | undefined) | undefined
  width?: number | undefined
}

/**
 * Failing scenarios as rule-4 findings: the scenario, then each failing
 * check's findings with the stable code, the component's source file and the
 * fix when the finding carries one. A cap is SAID when it bites.
 */
export function failureLines(t: Term, failures: readonly FailingScenario[], opts: FailureOptions = {}): string[] {
  const limit = opts.limit ?? Number.POSITIVE_INFINITY
  const width = opts.width ?? WRAP_WIDTH
  const lines = [`  ${t.err(t.bold(`${t.sym('err')} ${plural(failures.length, 'failing scenario')}`))}`]
  for (const failure of failures.slice(0, limit)) {
    lines.push(`  ${t.err(t.sym('err'))} ${t.bold(failure.id)}  ${t.dim(failure.component)}`)
    const source = opts.sourceOf?.(failure.id)
    for (const check of failure.checks) {
      for (const f of check.findings) {
        lines.push(
          ...finding(
            t,
            {
              severity: 'error',
              // The code is the part a reader can grep for, quote in an issue
              // or branch on — stable while the prose is free to be reworded.
              source: `${check.key} [${f.code}]`,
              message: f.message,
              location: source ? { path: source } : undefined,
              fix: f.fix,
            },
            { indent: 5, width },
          ),
        )
      }
    }
  }
  if (failures.length > limit) {
    lines.push(`  ${t.dim(`… and ${failures.length - limit} more failing scenario(s) — see the catalog JSON`)}`)
  }
  return lines
}

export interface VerdictInput {
  failed: number
  verified: number
  unverified: number
  components?: number | undefined
  /** Components whose module failed to load, so none of their checks ran. */
  failedToLoad?: number | undefined
  /** `--check` found a regression against the committed catalog. */
  regressed?: boolean | undefined
  /** `verify` fails a run that verified nothing; `scan` only warns. */
  nothingVerifiedFails?: boolean | undefined
  elapsedMs?: number | undefined
}

/** Rule 1, last line. A run that verified nothing is never shown as a pass. */
export function verdictLine(t: Term, v: VerdictInput, width = WRAP_WIDTH): string {
  const counts = [
    `${v.verified} verified`,
    `${v.unverified} unverified`,
    v.components === undefined ? undefined : plural(v.components, 'component'),
    v.elapsedMs === undefined ? undefined : formatElapsed(v.elapsedMs),
  ]
  const failing = plural(v.failed, 'failing scenario')
  const line = (status: 'ok' | 'warn' | 'err', text: string, meta: ReadonlyArray<string | undefined>) =>
    verdictLines(t, status, text, meta, width).join('\n')
  if (v.regressed) return line('err', 'regressed against the committed catalog (--check)', [failing, ...counts])
  if (v.failedToLoad && v.failedToLoad > 0) {
    return line('err', `${plural(v.failedToLoad, 'component')} could not be loaded`, [failing, ...counts])
  }
  if (v.failed > 0) return line('err', failing, counts)
  if (v.verified === 0) return line(v.nothingVerifiedFails ? 'err' : 'warn', 'nothing verified', [failing, ...counts])
  return line('ok', 'no failing scenarios', counts)
}

/**
 * The verdict line, wrapped at 100 columns between its `·` parts (never
 * inside one, so `412 ms` stays whole); continuation lines are indented.
 */
function verdictLines(
  t: Term,
  status: 'ok' | 'warn' | 'err' | 'info',
  text: string,
  meta: ReadonlyArray<string | undefined>,
  width: number,
): string[] {
  const parts = meta.filter((p): p is string => typeof p === 'string' && p !== '')
  const lines: string[] = []
  let line = verdict(t, status, text)
  for (const part of parts) {
    const next = `${line}${t.dim(` ${t.sym('bullet')} ${part}`)}`
    if (visibleWidth(next) <= width || line.trim() === '') line = next
    else {
      lines.push(line)
      line = `  ${t.dim(`${t.sym('bullet')} ${part}`)}`
    }
  }
  lines.push(line)
  return lines
}

/**
 * A scan notice (unmatched files, load errors, framework warnings) from its
 * plain formatter, in the shared look: the `atlas: …` lead becomes a `!`
 * warning heading, the body is indented under it, and every line wraps at
 * 100 columns with a hanging indent (rule 6) — paths are never cut.
 */
export function noticeLines(t: Term, lines: readonly string[], width = WRAP_WIDTH): string[] {
  const out: string[] = []
  lines
    .flatMap((l) => l.split('\n'))
    .forEach((line, i) => {
      if (i === 0) {
        const text = wrap(line.replace(/^atlas: /, ''), width, width - 4, '    ')
        out.push(`  ${t.warn(t.sym('warn'))} ${t.bold(text[0] ?? '')}`, ...text.slice(1).map((l) => t.bold(l)))
        return
      }
      const lead = /^\s*/.exec(line)?.[0] ?? ''
      const body = line.slice(lead.length).replace(/^▲ /, `${t.warn(t.sym('warn'))} `)
      const indent = `  ${lead}`
      const text = wrap(body, width, width - indent.length, `${indent}  `)
      out.push(`${indent}${text[0] ?? ''}`, ...text.slice(1))
    })
  return out
}

/**
 * `--check`: the delta against the committed catalog. The heading carries the
 * state in a symbol and a word (REGRESSED / IMPROVED / no change); each moved
 * scenario keeps its `✗` / `✓` / `+` / `−` mark, painted, and wraps at 100.
 */
export function ratchetLines(
  t: Term,
  summary: string,
  lines: readonly string[],
  regressed: boolean,
  width = WRAP_WIDTH,
): string[] {
  const status = regressed ? 'err' : summary.startsWith('IMPROVED') ? 'ok' : 'info'
  const out = [`  ${t.paint(status, t.sym(status))} ${t.bold('atlas --check:')} ${t.paint(status, summary)}`]
  for (const line of lines) {
    const m = /^(✗|✓|\+|−) (.*)$/.exec(line)
    const mark = m?.[1]
    const body = m?.[2] ?? line
    const painted =
      mark === '✗' ? t.err(t.sym('err')) : mark === '✓' ? t.ok(t.sym('ok')) : mark === '−' ? t.err(t.unicode ? '−' : '-') : mark === '+' ? t.ok('+') : ''
    const text = wrap(body, width, width - 6, '      ')
    out.push(`    ${painted ? `${painted} ` : ''}${text[0] ?? ''}`, ...text.slice(1))
  }
  return out
}
