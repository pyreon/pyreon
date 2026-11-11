/**
 * Terminal report, in the shared Pyreon terminal look (`@pyreon/ansi`).
 *
 * Two things it must never do: present a skipped check as a passing one, and
 * present a partial generation as a complete one. Both are the "silent filter"
 * failure this repo has hit repeatedly — an aggregate that quietly drops what
 * it could not handle reads as success.
 *
 * Layout (the six CLI rules): the first line says what ran, each project is
 * one status row (symbol, name, dim facts, state word) with its detail
 * indented beneath under a padded label column, and the last line is the
 * verdict with counts and the measured elapsed time. Every coloured state also
 * carries a symbol and a word, so `NO_COLOR` output is complete. Nothing is
 * truncated: long messages wrap at 100 columns with a hanging indent.
 */

import {
  columns,
  createTerm,
  detectColorLevel,
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
import type { GenerateResult } from '../core/generate'
import type { SurfaceChange } from '../core/surface'
import { affectsText, type ContractDiff } from '../core/contract'
import { noteSeverity, type IrNote } from '../core/ir'
import type { FileVerdict, VerifyReport } from '../verify/lower'

/** A colour choice as the CLI carries it: a flag (`--color` / `--no-color`) or a resolved level. */
export type ColorChoice = boolean | 0 | 1 | 2 | undefined

/** Rendering options shared by every report. Primitives only: no `@pyreon/ansi` type is public. */
export interface TermChoice {
  /**
   * Colour: `false` / `0` plain (the default — the caller knows the
   * destination), `true` / `1` sixteen colours, `2` truecolor.
   */
  color?: ColorChoice
  /** Terminal background. Detected (`PYREON_CLI_THEME`, `COLORFGBG`) when left out. */
  theme?: 'dark' | 'light' | undefined
  /** Unicode symbols, or the ASCII fallbacks. Detected from the locale when left out. */
  unicode?: boolean | undefined
}

const levelOf = (color: ColorChoice): 0 | 1 | 2 =>
  color === true ? 1 : color === false || color === undefined ? 0 : color

const termFor = (o: TermChoice): Term =>
  createTerm({ level: levelOf(o.color), theme: o.theme, unicode: o.unicode })

/**
 * Whether output to `stream` should be coloured: `NO_COLOR`, `TERM=dumb` and
 * `FORCE_COLOR=0` disable, `FORCE_COLOR` enables, and otherwise only a TTY gets
 * colour. The shared `@pyreon/ansi` detection, as a yes/no.
 */
export function shouldColor(
  stream: { isTTY?: boolean | undefined },
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return detectColorLevel(env, stream.isTTY === true) > 0
}

/**
 * The colour level the bin renders at. No flag: detected from the
 * environment. `--no-color`: plain. `--color`: forced on, at truecolor when the
 * terminal advertises it (`FORCE_COLOR=3`, `COLORTERM=truecolor`) and sixteen
 * colours otherwise — the flag overrides `NO_COLOR`, `TERM=dumb` and a pipe.
 */
export function resolveColorLevel(
  flag: boolean | undefined,
  stream: { isTTY?: boolean | undefined },
  env: Readonly<Record<string, string | undefined>>,
): 0 | 1 | 2 {
  if (flag === false) return 0
  if (flag === undefined) return detectColorLevel(env, stream.isTTY === true)
  const forced = { COLORTERM: env.COLORTERM, TERM: env.TERM === 'dumb' ? undefined : env.TERM, FORCE_COLOR: env.FORCE_COLOR === '3' ? '3' : '1' }
  return detectColorLevel(forced, true)
}

/** How many contract changes to print before summarising the rest. */
const MAX_CHANGES = 20
/** How many distinct loss notes to print before summarising the rest. */
const MAX_NOTES = 10

export type ReportMode = 'generate' | 'check' | 'dry-run'

export interface ReportOptions extends TermChoice {
  target: string
  output: string
  wrote: number
  /** Paths whose contents differ from disk. Everything else is unchanged. */
  changed?: ReadonlySet<string> | undefined
  /** The subset of `changed` that is NEW rather than updated. */
  created?: ReadonlySet<string> | undefined
  /** Contract changes vs the committed surface. */
  changes?: readonly SurfaceChange[] | undefined
  /** Previously-generated files removed because this run no longer emits them. */
  removed?: readonly string[] | undefined
  /** `check` / `--dry-run`: previously-generated files this run would remove. */
  orphaned?: readonly string[] | undefined
  name?: string | undefined
  /** The spec path, shown in the project row. */
  input?: string | undefined
  /** What the run did to the tree. Default `generate` (it wrote). */
  mode?: ReportMode | undefined
  plugins: readonly string[]
  requestedPlugins: readonly string[]
  /** Wrap width. Default 100. */
  width?: number | undefined
}

/**
 * One project's block: the status row and its detail. No header and no
 * verdict — a run prints those once, around every project (see `renderRun`).
 */
export function renderReport(result: GenerateResult, verify: VerifyReport, opts: ReportOptions): string {
  const t = termFor(opts)
  const label = opts.name || result.doc.title
  return `${projectLines(t, result, verify, opts, visibleWidth(label)).join('\n')}\n`
}

type Mark = { role: 'ok' | 'warn' | 'err' | 'info' | 'dim'; sym: string; word: string }

const markText = (t: Term, m: Mark): string => t.paint(m.role, `${m.sym} ${m.word}`)

/** The block's state: what happened to its files, in a symbol and a word. */
function projectState(result: GenerateResult, opts: ReportOptions): { status: 'ok' | 'warn' | 'err'; word: string } {
  const mode = opts.mode ?? 'generate'
  const pending = (opts.changed?.size ?? 0) + (opts.orphaned?.length ?? 0)
  if (mode === 'check') return pending > 0 ? { status: 'err', word: 'stale' } : { status: 'ok', word: 'up to date' }
  if (mode === 'dry-run') {
    return pending > 0
      ? { status: 'warn', word: `would change ${plural(pending, 'path')}` }
      : { status: 'ok', word: 'nothing would change' }
  }
  if (opts.changed === undefined) return { status: 'ok', word: `wrote ${plural(opts.wrote, 'file')}` }
  const removed = opts.removed?.length ?? 0
  if (opts.wrote === 0 && removed === 0) return { status: 'ok', word: 'already current' }
  return {
    status: 'ok',
    word: `wrote ${opts.wrote} of ${plural(result.files.length, 'file')}${removed > 0 ? `, removed ${removed}` : ''}`,
  }
}

/** `prefix` then `text` wrapped to `width`, continuation lines hanging under the text. */
function hang(prefix: string, text: string, width: number, paint: (s: string) => string = (s) => s): string[] {
  const pw = visibleWidth(prefix)
  // A prefix wider than half the line would leave a sliver for the text.
  const indent = pw <= width / 2 ? pw : 8
  const lines = wrap(text, width, width - pw, ' '.repeat(indent))
  // Painted per line, after wrapping, so every line opens and closes its own colour.
  return lines.map((l, i) => (i === 0 ? `${prefix}${paint(l)}` : `${' '.repeat(indent)}${paint(l.slice(indent))}`))
}

interface Section {
  label: string
  summary: string
  body: string[]
}

function projectLines(
  t: Term,
  result: GenerateResult,
  verify: VerifyReport,
  opts: ReportOptions,
  labelWidth: number,
): string[] {
  const width = opts.width ?? WRAP_WIDTH
  const { doc } = result
  const mode = opts.mode ?? 'generate'
  const b = ` ${t.sym('bullet')} `
  const state = projectState(result, opts)

  // ── the status row ───────────────────────────────────────────────────────
  // The project name leads when there is one, so a multi-project run reads as
  // a list rather than as several unlabelled reports in a row.
  const label = opts.name || doc.title
  const facts = [
    opts.name ? `${doc.title} ${doc.version}` : doc.version,
    opts.input,
    plural(doc.models.length, 'model'),
    plural(doc.operations.length, 'operation'),
    opts.target,
  ].filter((p): p is string => typeof p === 'string' && p !== '')
  const rowPrefix = `  ${t.paint(state.status, t.sym(state.status))} ${t.bold(label)}${' '.repeat(Math.max(0, labelWidth - visibleWidth(label)))}  `
  const row = hang(rowPrefix, `${t.dim(facts.join(b))}${t.dim(b)}${t.paint(state.status, state.word)}`, width)
  const sections: Section[] = []

  // ── plugins the selection did not name ───────────────────────────────────
  // A file set larger than the one you selected is confusing exactly once,
  // and only if nobody says why.
  const added = opts.plugins.filter((p) => !opts.requestedPlugins.includes(p))
  if (added.length > 0) {
    sections.push({
      label: 'plugins',
      summary: t.dim(`${opts.requestedPlugins.join(', ')} (+${added.join(', +')}, required by them)`),
      body: [],
    })
  }

  // ── what the run did, or would do, to each file ──────────────────────────
  // Only the files that moved are listed: "what did my spec edit move?" is the
  // question, and the unchanged ones are a count in the status row's verdict.
  // `+` is new, `~` is updated, `−` is removed — each with its word.
  const fileRows: string[][] = []
  const minus = t.unicode ? '−' : '-'
  const words =
    mode === 'check'
      ? { created: 'missing', updated: 'stale', removed: 'orphaned' }
      : mode === 'dry-run'
        ? { created: 'would create', updated: 'would update', removed: 'would remove' }
        : { created: 'new', updated: 'updated', removed: 'removed' }
  const path = (p: string) => `${opts.output}/${p}`
  if (opts.changed === undefined) {
    // The caller tracked nothing, so per-file status cannot be claimed.
    for (const f of result.files) fileRows.push([t.ok(`+ written`), path(f.path)])
  } else {
    for (const f of result.files) {
      if (!opts.changed.has(f.path)) continue
      fileRows.push(
        opts.created?.has(f.path)
          ? [t.ok(`+ ${words.created}`), path(f.path)]
          : [t.warn(`~ ${words.updated}`), path(f.path)],
      )
    }
  }
  // A removal is part of what the run did to the tree — a deletion that only
  // shows up in `git status` makes people distrust a generator.
  const gone = mode === 'generate' ? (opts.removed ?? []) : (opts.orphaned ?? [])
  for (const r of gone) fileRows.push([t.err(`${minus} ${words.removed}`), path(r)])
  if (fileRows.length > 0) {
    const total = result.files.length
    const summary =
      opts.changed === undefined
        ? plural(opts.wrote, 'file') + ' written'
        : mode === 'check'
          ? `${fileRows.length} of ${plural(total + gone.length, 'file')} differ from the spec`
          : mode === 'dry-run'
            ? `${plural(fileRows.length, 'path')} would change`
            : `${opts.wrote} of ${plural(total, 'file')} written${gone.length > 0 ? `, ${gone.length} removed` : ''}`
    sections.push({ label: 'files', summary, body: columns(fileRows, { indent: 6 }) })
  }

  // ── the client contract ──────────────────────────────────────────────────
  // Before the native report: a breaking change is the most consequential
  // thing a run can tell you, and a reader who stops early should have seen it.
  const changes = opts.changes ?? []
  if (changes.length > 0) {
    const breaking = changes.filter((c) => c.severity === 'breaking').length
    sections.push({
      label: 'contract',
      summary:
        (breaking > 0 ? t.err(`${breaking} breaking`) : t.ok('no breaking changes')) +
        t.dim(`${b}${changes.length - breaking} additive`),
      body: [
        ...changeLines(t, changes.slice(0, MAX_CHANGES), 6, width),
        // Never truncate SILENTLY: a capped list that does not say it was
        // capped reads as a complete one.
        ...(changes.length > MAX_CHANGES
          ? [`      ${t.dim(`… and ${changes.length - MAX_CHANGES} more (use --json for all)`)}`]
          : []),
      ],
    })
  }

  // ── native reach ─────────────────────────────────────────────────────────
  if (opts.target === 'multiplatform') {
    const reaches = [...result.reach.values()]
    const ok = reaches.filter((r) => r.reach === 'web+native').length
    // Grouped by reason, so a 400-operation spec does not print 400
    // near-identical lines.
    const grouped = new Map<string, string[]>()
    for (const [id, r] of result.reach) {
      if (r.reach === 'web+native') continue
      const key = r.reason ?? 'unknown'
      const list = grouped.get(key)
      if (list) list.push(id)
      else grouped.set(key, [id])
    }
    const body: string[] = []
    for (const [reason, ids] of grouped) {
      body.push(...hang(`      ${t.warn(`${t.sym('warn')} web-only`)}  `, `${plural(ids.length, 'operation')}: ${preview(ids)}`, width))
      body.push(...hang('        ', reason, width, t.dim))
    }
    sections.push({
      label: 'native reach',
      summary: `${ok} of ${plural(reaches.length, 'operation')}${grouped.size > 0 ? t.dim(`${b}${reaches.length - ok} web-only`) : ''}`,
      body,
    })
  }

  // ── native verification ──────────────────────────────────────────────────
  // A skip is SAID, never shown as a pass: "we could not check" and "it is
  // fine" are different answers. On a web target there is nothing to verify.
  if (!verify.ran) {
    if (opts.target !== 'web') {
      sections.push({
        label: 'native verify',
        summary: `${t.warn(`${t.sym('warn')} skipped`)}${verify.reason ? t.dim(`${b}${verify.reason}`) : ''}`,
        body: [],
      })
    }
  } else if (verify.files.length > 0 || (verify.modules ?? []).length > 0) {
    const lowers = verify.files.filter((f) => f.verdict === 'lowers').length
    sections.push({
      label: 'native verify',
      summary: `${lowers} of ${plural(verify.files.length, 'file')} lower`,
      body: verifyLines(t, verify, width),
    })
  }

  // ── spec notes ───────────────────────────────────────────────────────────
  // LOSSES lead, CHOICES are summarised. Petstore 3 produced 17 notes and 16
  // were "used JSON over XML" — listed at one weight, the single real loss was
  // the note nobody reached.
  if (doc.notes.length > 0) {
    const losses = doc.notes.filter((n) => noteSeverity(n) === 'loss')
    const choices = doc.notes.filter((n) => noteSeverity(n) === 'choice')
    const body: string[] = []
    // The cap counts DISTINCT entries, because that is what is printed.
    const distinct = dedupeNotes(losses)
    for (const { note: n, count } of distinct.slice(0, MAX_NOTES)) {
      body.push(
        ...finding(
          t,
          {
            severity: 'warn',
            source: n.code,
            message: count > 1 ? `${n.message} (+${count - 1} more like it)` : n.message,
            location: { path: n.at },
          },
          { indent: 6, width },
        ),
      )
    }
    if (distinct.length > MAX_NOTES) {
      body.push(`      ${t.dim(`… and ${distinct.length - MAX_NOTES} more distinct loss(es) (use --json for all ${losses.length})`)}`)
    }
    if (choices.length > 0) {
      const byCode = new Map<string, number>()
      for (const n of choices) byCode.set(n.code, (byCode.get(n.code) ?? 0) + 1)
      body.push(
        ...hang('      ', `choices: ${[...byCode].map(([code, n]) => `${code} x${n}`).join(', ')} (use --json for detail)`, width, t.dim),
      )
    }
    sections.push({
      label: 'spec notes',
      summary:
        `${plural(doc.notes.length, 'note')}${t.dim(b)}` +
        (losses.length > 0 ? t.warn(`${t.sym('warn')} ${losses.length} lost`) : t.ok(`${t.sym('ok')} nothing lost`)) +
        t.dim(`${b}${plural(choices.length, 'choice')}`),
      body,
    })
  }

  // Rule 2: the label column is padded to the longest label in this block.
  const lw = Math.max(0, ...sections.map((s) => s.label.length))
  const lines = [...row]
  for (const s of sections) {
    lines.push(...hang(`    ${t.bold(s.label)}${' '.repeat(lw - s.label.length)}  `, s.summary, width))
    lines.push(...s.body)
  }
  return lines
}

/** The per-file native verdicts, the modules-together compile, and what explains a failure. */
function verifyLines(t: Term, verify: VerifyReport, width: number): string[] {
  const verdictMark = (f: FileVerdict): Mark =>
    f.verdict === 'lowers'
      ? { role: 'ok', sym: t.sym('ok'), word: 'lowers' }
      : f.verdict === 'broken'
        ? { role: 'err', sym: t.sym('err'), word: 'broken' }
        : { role: 'warn', sym: t.sym('warn'), word: f.verdict }
  const compiled = (c: FileVerdict['compiled']): string =>
    c === undefined ? '' : 'skipped' in c ? t.dim('not compiled') : c.ok ? t.dim('compiled') : t.err('does not compile')
  const rows = verify.files.map((f) => [
    markText(t, verdictMark(f)),
    f.path,
    t.dim(f.target),
    compiled(f.compiled),
  ])
  const modules = verify.modules ?? []
  for (const m of modules) {
    const c = m.compiled
    rows.push([
      'skipped' in c
        ? t.warn(`${t.sym('warn')} not compiled`)
        : c.ok
          ? t.ok(`${t.sym('ok')} compiled`)
          : t.err(`${t.sym('err')} does not compile`),
      'all modules together',
      t.dim(m.target),
      'skipped' in c ? t.dim(c.skipped) : '',
    ])
  }
  const table = columns(rows, { indent: 6 })
  const out: string[] = []
  const sub = '          '
  const detail = (prefix: string, text: string): string[] => hang(`${sub}${prefix}`, text, width)
  // The positive markers that prove a real lowering. When every file found
  // the same set it is said once, after the table, instead of on every row.
  const markerSets = new Set(verify.files.map((f) => f.markers.join(' ')))
  const shared = markerSets.size === 1 ? [...markerSets][0] ?? '' : undefined
  verify.files.forEach((f, i) => {
    // Otherwise the markers follow the row when they fit, else take their
    // own line: wrapping beats a row past 100 columns.
    const head = table[i] as string
    const markers = shared === undefined ? f.markers.join(' ') : ''
    if (markers === '') out.push(head)
    else if (visibleWidth(head) + 2 + markers.length <= width) out.push(`${head}  ${t.dim(markers)}`)
    else out.push(head, ...hang(sub, markers, width, t.dim))
    for (const l of f.leaked) {
      out.push(...detail(`${t.err(`${t.sym('err')} leaked`)} `, `${l} ${t.dim('emitted verbatim; the native build will not link')}`))
    }
    // Compile errors and a BROKEN verdict's warnings are the diagnosis, so they
    // print in FULL: a 120-character cut took the actionable half ("Give it
    // the shape you expect: …") off every one.
    if (f.compiled && 'ok' in f.compiled) {
      for (const e of f.compiled.errors.slice(0, 2)) out.push(...detail(`${t.err(`${t.sym('err')} error`)} `, e))
    }
    if (f.verdict === 'broken') {
      for (const w of f.warnings) out.push(...detail('', w))
    } else if (f.declarations.length > 0) {
      // Per DECLARATION (audit G2): which model lost what, not just "a warning".
      for (const d of f.declarations.filter((x) => x.verdict !== 'lowers').slice(0, 5)) {
        out.push(...hang(`${sub}${t.warn(`${t.sym('warn')} ${d.verdict}`)} ${d.name} `, `${t.sym('dash')} ${d.reasons[0] ?? ''}`, width, t.dim))
      }
    } else {
      for (const w of f.warnings.slice(0, 2)) out.push(...hang(sub, w, width, t.dim))
      if (f.warnings.length > 2) {
        out.push(`${sub}${t.dim(`… and ${f.warnings.length - 2} more warning(s) (use --json for all)`)}`)
      }
    }
  })
  modules.forEach((m, i) => {
    out.push(table[verify.files.length + i] as string)
    if ('ok' in m.compiled) {
      for (const e of m.compiled.errors.slice(0, 2)) out.push(...detail(`${t.err(`${t.sym('err')} error`)} `, e))
    }
  })
  if (shared) out.push(...hang(`      ${t.dim('markers')}  `, shared, width, t.dim))
  return out
}

/** A contract change's symbol: `+` added, `−` removed, `~` changed; coloured by severity. */
function changeMark(t: Term, c: Pick<SurfaceChange, 'code' | 'severity'>): string {
  const sym = c.code.endsWith('-added') ? '+' : c.code.endsWith('-removed') ? (t.unicode ? '−' : '-') : '~'
  const role = c.severity === 'breaking' ? 'err' : sym === '+' ? 'ok' : 'warn'
  return t.paint(role, `${sym} ${c.severity}`)
}

/** Contract changes as aligned rows: mark + severity word, code, subject, then the detail wrapped. */
function changeLines(
  t: Term,
  changes: ReadonlyArray<SurfaceChange & { affects?: ContractDiff['changes'][number]['affects'] }>,
  indent: number,
  width: number,
): string[] {
  const heads = columns(
    changes.map((c) => [changeMark(t, c), t.dim(c.code), c.subject, '.']),
    { indent },
  )
  const out: string[] = []
  changes.forEach((c, i) => {
    // The trailing '.' cell pads the subject column; it is replaced by the detail.
    const prefix = (heads[i] as string).slice(0, -1)
    out.push(...hang(prefix, c.detail, width))
    const a = c.affects ? affectsText(c as ContractDiff['changes'][number]) : ''
    if (a) out.push(...hang(`${' '.repeat(indent + 4)}${t.dim('affects')} `, a, width))
  })
  return out
}

/** One project's outcome, as the run loop holds it. */
export interface ProjectRun {
  result: GenerateResult
  verify: VerifyReport
  options: Omit<ReportOptions, keyof TermChoice | 'mode' | 'width'>
  /** Paths `check` / `--dry-run` found differing (the JSON `stale` list). */
  stale: readonly string[]
}

export interface RunReportOptions extends TermChoice {
  command: 'generate' | 'check'
  dryRun: boolean
  /** The run's exit code: a non-zero run gets a failing verdict. */
  code: number
  failOnBreaking: boolean
  /** Projects whose native verification must pass (`--strict-native`). */
  strictNative: (index: number) => boolean
  /** Wall-clock time of the run, measured by the caller. */
  elapsedMs?: number | undefined
  width?: number | undefined
}

/**
 * A whole `lathe generate` / `check` run: the header, one block per project,
 * then the verdict — counts, what to do next, and the measured elapsed time.
 */
export function renderRun(runs: readonly ProjectRun[], opts: RunReportOptions): string {
  const t = termFor(opts)
  const mode: ReportMode = opts.command === 'check' ? 'check' : opts.dryRun ? 'dry-run' : 'generate'
  const n = runs.length
  const context = [plural(n, 'project'), ...(mode === 'dry-run' ? ['dry run'] : [])].join(` ${t.sym('bullet')} `)
  const lines = [header(t, `lathe ${opts.command}`, context), '']
  const labelWidth = Math.max(0, ...runs.map((r) => visibleWidth(r.options.name || r.result.doc.title)))
  runs.forEach((r, i) => {
    if (i > 0) lines.push('')
    lines.push(
      ...projectLines(t, r.result, r.verify, { ...r.options, mode, width: opts.width }, labelWidth),
    )
  })

  // ── the verdict ──────────────────────────────────────────────────────────
  const staleProjects = runs.filter((r) => r.stale.length > 0).length
  const pendingPaths = runs.reduce((s, r) => s + r.stale.length, 0)
  const wrote = runs.reduce((s, r) => s + r.options.wrote, 0)
  const removed = runs.reduce((s, r) => s + (r.options.removed?.length ?? 0), 0)
  const files = runs.reduce((s, r) => s + r.result.files.length, 0)
  const breaking = runs.reduce((s, r) => s + (r.options.changes ?? []).filter((c) => c.severity === 'breaking').length, 0)
  const nativeOff = runs.reduce((s, r) => s + r.verify.files.filter((f) => f.verdict !== 'lowers').length, 0)
  const nativeSkipped = runs.filter((r) => !r.verify.ran && r.options.target !== 'web').length
  const strictFail = runs.some(
    (r, i) => opts.strictNative(i) && (!r.verify.ran || r.verify.files.some((f) => f.verdict !== 'lowers')),
  )
  const of = (k: number) => (n === 1 ? plural(k, 'project') : `${k} of ${plural(n, 'project')}`)

  let primary: string
  const meta: string[] = []
  if (mode === 'check') {
    primary = staleProjects > 0 ? `${of(staleProjects)} stale` : `${plural(n, 'project')} up to date`
  } else if (mode === 'dry-run') {
    primary = pendingPaths > 0 ? `${plural(pendingPaths, 'path')} would change` : 'nothing would change'
  } else {
    primary =
      wrote > 0 || removed > 0
        ? `wrote ${wrote} of ${plural(files, 'file')}${removed > 0 ? `, removed ${removed}` : ''}`
        : 'everything already current'
    if (n > 1) meta.push(plural(n, 'project'))
  }
  const failures: string[] = []
  if (opts.failOnBreaking && breaking > 0) failures.push(`${plural(breaking, 'breaking change')} (--fail-on-breaking)`)
  else if (breaking > 0) meta.push(plural(breaking, 'breaking change'))
  if (strictFail) failures.push('native verification did not pass (--strict-native)')
  else {
    if (nativeOff > 0) meta.push(`${plural(nativeOff, 'native file')} not lowering`)
    if (nativeSkipped > 0) meta.push('native verify skipped')
  }
  if (opts.elapsedMs !== undefined) meta.push(formatElapsed(opts.elapsedMs))

  const freshFailed = mode === 'check' && staleProjects > 0
  const width = opts.width ?? WRAP_WIDTH
  const status =
    opts.code !== 0
      ? 'err'
      : (mode === 'dry-run' && pendingPaths > 0) || breaking > 0 || nativeOff > 0 || nativeSkipped > 0
        ? 'warn'
        : 'ok'
  // A failure that is not about freshness leads the verdict; the freshness
  // statement follows it as a fact.
  const text = !freshFailed && failures.length > 0 ? failures[0] as string : primary
  const rest = !freshFailed && failures.length > 0 ? [primary, ...failures.slice(1)] : failures
  lines.push('')
  // What to do next, just above the verdict.
  if (freshFailed) lines.push(`  ${t.dim('fix:')} run lathe generate and commit the result`, '')
  lines.push(...verdictLines(t, status, text, [...rest, ...meta], width))
  return `${lines.join('\n')}\n`
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
 * `lathe diff`'s human output: header, every change (breaking first, as the
 * diff orders them) with what it affects, and the verdict.
 */
export function renderDiffText(
  diff: ContractDiff,
  opts: TermChoice & {
    before: string
    after: string
    failOnBreaking: boolean
    elapsedMs?: number | undefined
    width?: number | undefined
  },
): string {
  const t = termFor(opts)
  const width = opts.width ?? WRAP_WIDTH
  const lines = [header(t, 'lathe diff', `${opts.before} ${t.sym('arrow')} ${opts.after}`), '']
  if (diff.before.title !== diff.after.title) {
    lines.push(`  ${t.bold('title')}  ${diff.before.title} ${t.dim(t.sym('arrow'))} ${diff.after.title}`, '')
  }
  if (diff.changes.length > 0) {
    lines.push(...changeLines(t, diff.changes, 2, width), '')
  }
  const elapsed = opts.elapsedMs === undefined ? [] : [formatElapsed(opts.elapsedMs)]
  if (diff.changes.length === 0) {
    lines.push(verdict(t, 'ok', 'no contract changes', elapsed))
  } else {
    const status = diff.breaking > 0 ? (opts.failOnBreaking ? 'err' : 'warn') : 'ok'
    lines.push(
      verdict(t, status, `${diff.breaking} breaking, ${diff.additive} additive`, [
        diff.breaking > 0 && opts.failOnBreaking ? '--fail-on-breaking' : undefined,
        ...elapsed,
      ]),
    )
  }
  return `${lines.join('\n')}\n`
}

/**
 * Collapse repeats of the same code+message; keep the first location and how
 * many were folded into it, so a collapsed entry still reports its weight.
 */
function dedupeNotes(notes: readonly IrNote[]): Array<{ note: IrNote; count: number }> {
  const seen = new Map<string, { note: IrNote; count: number }>()
  for (const n of notes) {
    const key = `${n.code}|${n.message}`
    const hit = seen.get(key)
    if (hit) hit.count++
    else seen.set(key, { note: n, count: 1 })
  }
  return [...seen.values()]
}

function preview(ids: string[]): string {
  return ids.length <= 3 ? ids.join(', ') : `${ids.slice(0, 3).join(', ')} +${ids.length - 3}`
}
