// Human terminal output for `pyreon-native`, in the shared Pyreon CLI theme
// (`@pyreon/ansi`). Every function here RETURNS lines and never prints, so a
// report is a pure function of (data, terminal) and snapshot-testable at
// every colour level. `cli.ts` and `dev.ts` own the IO.
//
// Not exported from the package entry: `@pyreon/ansi` is private and inlined
// by the build, so none of its types may reach a published `.d.ts`.
//
// Machine surfaces (`check --json`, `wire --json`, the LSP payload) never go
// through this file; `tests/machine-output-lock.test.ts` locks them.

import { isAbsolute, relative } from 'node:path'
import type { TargetLanguage } from '@pyreon/native-compiler'
import {
  createTerm,
  finding,
  formatCounts,
  formatElapsed,
  formatLocation,
  header,
  plural,
  type Severity,
  type Term,
  verdict,
  wrap,
  WRAP_WIDTH,
} from '@pyreon/ansi'
import type { CheckFinding, CheckResult } from './check'

export const CLI_NAME = 'pyreon-native'

/** Which console stream a line belongs on (errors and warnings keep their own channels). */
export type Stream = 'log' | 'warn' | 'error'

export interface Line {
  to: Stream
  text: string
}

/** Primitive render options; the `Term`s are built from them. */
export interface RenderOptions {
  /** 0 plain, 1 sixteen colours, 2 truecolor. Detected when left out. */
  color?: 0 | 1 | 2 | undefined
  theme?: 'dark' | 'light' | undefined
  unicode?: boolean | undefined
  /** Paths are shown relative to this directory. Default `process.cwd()`. */
  cwd?: string | undefined
  width?: number | undefined
}

/** One terminal per stream: stdout and stderr can differ (`2>file`). */
export interface Out {
  /** stdout. */
  t: Term
  /** stderr (warnings and errors). */
  te: Term
  cwd: string
  width: number
}

export function outFor(o: RenderOptions = {}): Out {
  const base = { level: o.color, theme: o.theme, unicode: o.unicode }
  return {
    t: createTerm(base),
    te: createTerm({ ...base, isTTY: Boolean(process.stderr?.isTTY) }),
    cwd: o.cwd ?? process.cwd(),
    width: o.width ?? WRAP_WIDTH,
  }
}

/** Print rendered lines to their streams. */
export function emit(lines: readonly Line[]): void {
  for (const l of lines) {
    if (l.to === 'error') console.error(l.text)
    else if (l.to === 'warn') console.warn(l.text)
    else console.log(l.text)
  }
}

/** Plain text of a rendered block (tests, snapshots). */
export const joinLines = (lines: readonly Line[]): string => lines.map((l) => l.text).join('\n')

/** Relative to `cwd` when the path is inside it; the full path otherwise (never truncated). */
export function displayPath(path: string, cwd: string): string {
  if (!isAbsolute(path)) return path
  const rel = relative(cwd, path)
  return rel === '' ? '.' : rel.startsWith('..') || isAbsolute(rel) ? path : rel
}

const location = (o: Out, t: Term, path: string, pos?: { line: number; column: number }) =>
  formatLocation(t, {
    path: displayPath(path, o.cwd),
    abs: isAbsolute(path) ? path : undefined,
    line: pos?.line,
    column: pos?.column,
  })

/** `ios` / `android`: the words the commands take. */
export const platformOf = (target: TargetLanguage): string => (target === 'swift' ? 'ios' : 'android')

const blank = (to: Stream = 'log'): Line => ({ to, text: '' })

/** A message block under a verdict line: wrapped, indented, dim. */
const detailLines = (t: Term, message: string, width: number, indent: string): string[] =>
  wrap(message, width, width - indent.length, indent).map((l, i) => t.dim(i === 0 ? `${indent}${l}` : l))

// ── check ─────────────────────────────────────────────────────────────────

export interface CheckContext {
  source: string
  targets: TargetLanguage[]
  typecheck?: boolean | undefined
  watching?: boolean | undefined
}

/** Rule 1 first line: `pyreon-native check · src · swift + kotlin`. */
export function checkHeader(o: Out, ctx: CheckContext): Line[] {
  const parts = [
    ctx.watching ? `watching ${displayPath(ctx.source, o.cwd)}` : displayPath(ctx.source, o.cwd),
    ctx.targets.join(' + '),
    ctx.typecheck ? 'swiftc -typecheck' : '',
    ctx.watching ? 'Ctrl-C to stop' : '',
  ].filter(Boolean)
  return [{ to: 'log', text: header(o.t, `${CLI_NAME} check`, parts.join(` ${o.t.sym('bullet')} `)) }]
}

interface MergedFinding {
  kind: CheckFinding['kind']
  file: string
  position?: { line: number; column: number } | undefined
  message: string
  targets: TargetLanguage[]
}

const severityOf = (kind: CheckFinding['kind']): Severity =>
  kind === 'error' || kind === 'typecheck-error' ? 'error' : kind === 'warning' ? 'warning' : 'info'

const wordOf = (kind: CheckFinding['kind']): string =>
  kind === 'error' ? 'error' : kind === 'typecheck-error' ? 'type error' : kind === 'warning' ? 'warning' : 'skipped'

/**
 * The compiler prefixes a positioned error with `<file>:<line>:<col>: `,
 * which the `↳` location line already shows; drop the duplicate.
 */
function messageBody(f: CheckFinding): string {
  if (!f.position) return f.message
  const prefix = `${f.file}:${f.position.line}:${f.position.column}: `
  return f.message.startsWith(prefix) ? f.message.slice(prefix.length) : f.message
}

/**
 * The same finding on both targets (the common case: a shape outside the
 * subset is outside it everywhere) prints once, naming both targets.
 */
export function mergeFindings(findings: readonly CheckFinding[]): MergedFinding[] {
  const merged = new Map<string, MergedFinding>()
  for (const f of findings) {
    const message = messageBody(f)
    const pos = f.position ? `${f.position.line}:${f.position.column}` : ''
    const key = `${f.kind}\0${f.file}\0${pos}\0${message}`
    const hit = merged.get(key)
    if (hit) {
      if (!hit.targets.includes(f.target)) hit.targets.push(f.target)
    } else {
      merged.set(key, { kind: f.kind, file: f.file, position: f.position, message, targets: [f.target] })
    }
  }
  return [...merged.values()]
}

/** Rule 4 block: `✗ error · swift + kotlin · message`, then `↳ file:line:col`. */
function findingBlock(
  o: Out,
  t: Term,
  f: { severity: Severity; word: string; scope: string; message: string; file: string; position?: { line: number; column: number } | undefined },
  indent = 2,
): string[] {
  const lines = finding(
    t,
    {
      severity: f.severity,
      source: f.word,
      message: f.scope ? `${t.dim(`${f.scope} ${t.sym('bullet')}`)} ${f.message}` : f.message,
    },
    { indent, width: o.width },
  )
  // The `↳` line is built here rather than by `finding`: the path is shown
  // relative to the working directory but linked by its absolute path.
  if (f.file !== '') {
    lines.push(`${' '.repeat(indent + 3)}${t.dim(t.sym('at'))} ${location(o, t, f.file, f.position)}`)
  }
  return lines
}

/** Each finding to its stream: errors to stderr, warnings and skips to the warn channel. */
export function checkFindings(o: Out, findings: readonly CheckFinding[]): Line[] {
  const lines: Line[] = []
  for (const f of mergeFindings(findings)) {
    const severity = severityOf(f.kind)
    const to: Stream = severity === 'error' ? 'error' : 'warn'
    const block = findingBlock(o, o.te, {
      severity,
      word: wordOf(f.kind),
      scope: f.targets.join(' + '),
      message: f.message,
      file: f.file,
      position: f.position,
    })
    for (const text of block) lines.push({ to, text })
  }
  return lines
}

export interface CheckReportContext extends CheckContext {
  elapsedMs: number
}

/** Rule 1 last line: `✗ 2 errors, 1 warning · 3 files · 12 ms`. */
export function checkVerdict(o: Out, result: CheckResult, ctx: CheckReportContext): Line {
  const { t } = o
  const status = result.errorCount > 0 ? 'err' : result.warningCount > 0 ? 'warn' : 'ok'
  const text =
    status === 'ok'
      ? 'no errors or warnings'
      : formatCounts(t, { errors: result.errorCount, warnings: result.warningCount })
  const skippedTypecheck = result.findings.filter((f) => f.kind === 'typecheck-skipped').length
  const web = result.skippedWebEntries.length
  return {
    to: 'log',
    text: verdict(t, status, text, [
      `${plural(result.filesChecked, 'file')} checked`,
      ctx.typecheck ? `${skippedTypecheck} type-check skipped` : '',
      web > 0 ? `${plural(web, 'web-only entry', 'web-only entries')} skipped` : '',
      formatElapsed(ctx.elapsedMs),
      ctx.watching ? 'waiting for changes…' : '',
    ]),
  }
}

/** One check result: findings, then the verdict (the header is printed once by the caller). */
export function checkReport(o: Out, result: CheckResult, ctx: CheckReportContext): Line[] {
  const findings = checkFindings(o, result.findings)
  return [blank(), ...findings, ...(findings.length > 0 ? [blank()] : []), checkVerdict(o, result, ctx)]
}

// ── build ─────────────────────────────────────────────────────────────────

export interface BuildContext {
  /** Platform words, `ios` or `ios + android`. */
  platforms: string
  source: string
  out: string
}

export function buildHeader(o: Out, ctx: BuildContext): Line[] {
  const b = o.t.sym('bullet')
  const ctxText = `${ctx.platforms} ${b} ${displayPath(ctx.source, o.cwd)} ${o.t.sym('arrow')} ${displayPath(ctx.out, o.cwd)}`
  return [{ to: 'log', text: header(o.t, `${CLI_NAME} build`, ctxText) }, blank()]
}

export interface BuildTargetResult {
  target: TargetLanguage
  outDir: string
  filesCompiled: number
  warnings: { file: string; warning: string }[]
  skippedWebEntries: string[]
  elapsedMs: number
  /** Set when the build threw. */
  error?: string | undefined
}

/**
 * One target's block: warnings (warn channel), skipped web entries, then
 * `✓ compiled N files → out`. In a multi-target build each verdict names
 * its platform and the block is indented under the run's own verdict.
 */
export function buildTargetLines(o: Out, r: BuildTargetResult, multi: boolean): Line[] {
  const lines: Line[] = []
  const indent = multi ? 2 : 0
  const pad = ' '.repeat(indent)
  // Findings sit under a multi-target result line, one level in.
  const label = multi ? `${platformOf(r.target)} ${o.t.sym('bullet')} ` : ''
  if (r.error !== undefined) {
    lines.push({ to: 'error', text: `${pad}${verdict(o.te, 'err', `${label}build failed`, [formatElapsed(r.elapsedMs)])}` })
    // A compiler error that leads with `<file>:<line>:<col>: ` shows that as a linked location.
    const located = /^(\/[^\n]*?):(\d+):(\d+): ([\s\S]*)$/.exec(r.error)
    const message = located ? located[4]! : r.error
    for (const text of detailLines(o.te, message, o.width, `${pad}  `)) lines.push({ to: 'error', text })
    if (located) {
      const at = location(o, o.te, located[1]!, { line: Number(located[2]), column: Number(located[3]) })
      lines.push({ to: 'error', text: `${pad}  ${o.te.dim(o.te.sym('at'))} ${at}` })
    }
    return lines
  }
  for (const w of r.warnings) {
    for (const text of findingBlock(o, o.te, {
      severity: 'warning',
      word: 'warning',
      scope: r.target,
      message: w.warning,
      file: w.file,
    }, indent + 2)) {
      lines.push({ to: 'warn', text })
    }
  }
  if (r.skippedWebEntries.length > 0) {
    const { t } = o
    const n = r.skippedWebEntries.length
    lines.push({
      to: 'log',
      text: `${pad}  ${t.info(t.sym('info'))} ${t.bold('skipped')} ${t.dim(t.sym('bullet'))} ${plural(n, 'web-only entry file')} (import @pyreon/runtime-dom|runtime-server)`,
    })
    for (const f of r.skippedWebEntries) {
      lines.push({ to: 'log', text: `${pad}     ${t.dim(t.sym('at'))} ${location(o, t, f)}` })
    }
  }
  const done: Line = {
    to: 'log',
    text: `${multi ? '  ' : ''}${verdict(o.t, 'ok', `${label}compiled ${plural(r.filesCompiled, 'file')} ${o.t.sym('arrow')} ${displayPath(r.outDir, o.cwd)}`, [
      r.warnings.length > 0 ? plural(r.warnings.length, 'warning') : '',
      formatElapsed(r.elapsedMs),
    ])}`,
  }
  // One target: its findings, then the verdict as the last line. Several:
  // each target's result line heads its own findings, and the run's verdict
  // (`buildAllVerdict`) is the last line.
  if (multi) return [done, ...lines]
  return lines.length > 0 ? [...lines, blank(), done] : [done]
}

/** The `--target=all` run's last line. */
export function buildAllVerdict(o: Out, results: readonly BuildTargetResult[], elapsedMs: number): Line[] {
  const failed = results.filter((r) => r.error !== undefined)
  const warnings = results.reduce((n, r) => n + r.warnings.length, 0)
  const text =
    failed.length === 0
      ? `built ${results.map((r) => platformOf(r.target)).join(' + ')}`
      : `${failed.length} of ${results.length} targets failed (${failed.map((r) => platformOf(r.target)).join(', ')})`
  return [
    blank(),
    {
      to: 'log',
      text: verdict(o.t, failed.length === 0 ? 'ok' : 'err', text, [
        warnings > 0 ? plural(warnings, 'warning') : '',
        formatElapsed(elapsedMs),
      ]),
    },
  ]
}

// ── one-shot commands: assets, stage-web, web hosts ───────────────────────

export function commandHeader(o: Out, command: string, context: string): Line[] {
  return [{ to: 'log', text: header(o.t, `${CLI_NAME} ${command}`, context) }, blank()]
}

/** `platform · source → out` header context. */
export function flowContext(o: Out, platform: string, source: string, out: string): string {
  const b = o.t.sym('bullet')
  return `${platform} ${b} ${displayPath(source, o.cwd)} ${o.t.sym('arrow')} ${displayPath(out, o.cwd)}`
}

export function okVerdict(o: Out, text: string, elapsedMs: number, meta: string[] = []): Line {
  return { to: 'log', text: verdict(o.t, 'ok', text, [...meta, formatElapsed(elapsedMs)]) }
}

/** `✗ <what> failed · 12 ms`, then the message, on stderr. */
export function failure(o: Out, what: string, message: string, elapsedMs?: number): Line[] {
  return [
    {
      to: 'error',
      text: verdict(o.te, 'err', `${what} failed`, [elapsedMs === undefined ? '' : formatElapsed(elapsedMs)]),
    },
    ...detailLines(o.te, message, o.width, '  ').map((text): Line => ({ to: 'error', text })),
  ]
}

export function warningLine(o: Out, message: string): Line[] {
  return findingBlock(o, o.te, { severity: 'warning', word: 'warning', scope: '', message, file: '' }).map(
    (text): Line => ({ to: 'warn', text }),
  )
}

// ── wire ──────────────────────────────────────────────────────────────────

export interface WireView {
  appDir: string
  androidSrcDirs: string[]
  iosSpmPackages: { module: string; path: string }[]
  iosTargetSources: { module: string; dirs: string[] }[]
  brokenDeclarations: { package: string; target: string; dir: string }[]
  /** `--android-out`: the file written. */
  androidOut?: string | undefined
  /** `--ios-out`: the Xcode project dir and what was staged into it. */
  ios?: { dir: string; staged: number; linked: number } | undefined
  /** The full listing (no `--android-out` / `--ios-out`). */
  list: boolean
  elapsedMs: number
}

export function wireHeader(o: Out, appDir: string): Line[] {
  return commandHeader(o, 'wire', displayPath(appDir, o.cwd))
}

/** The broken declarations, one finding each, on stderr (printed in `--json` mode too). */
export function wireBroken(o: Out, w: Pick<WireView, 'brokenDeclarations'>): Line[] {
  const lines: Line[] = []
  for (const b of w.brokenDeclarations) {
    for (const text of findingBlock(o, o.te, {
      severity: 'error',
      word: 'error',
      scope: b.target,
      message: `${b.package} declares native sources in a directory that does not exist`,
      file: b.dir,
    })) {
      lines.push({ to: 'error', text })
    }
  }
  return lines
}

export function wireReport(o: Out, w: WireView): Line[] {
  const { t } = o
  const lines: Line[] = []
  const arrow = t.sym('arrow')
  const ok = t.ok(t.sym('ok'))
  if (w.androidOut !== undefined) {
    lines.push({
      to: 'log',
      text: `  ${ok} wrote ${plural(w.androidSrcDirs.length, 'Android srcDir')} ${arrow} ${location(o, t, w.androidOut)}`,
    })
  }
  if (w.ios !== undefined) {
    lines.push({
      to: 'log',
      text:
        `  ${ok} staged ${plural(w.ios.staged, 'co-located Swift file')}, ` +
        `linked ${plural(w.ios.linked, 'SwiftPM package')} ${arrow} ${location(o, t, w.ios.dir)}`,
    })
  }
  if (w.list) {
    const section = (title: string, n: number) => `  ${t.bold(title)} ${t.dim(`(${n})`)}`
    lines.push({ to: 'log', text: section('Android srcDirs', w.androidSrcDirs.length) })
    for (const d of w.androidSrcDirs) lines.push({ to: 'log', text: `    ${location(o, t, d)}` })
    lines.push({ to: 'log', text: section('iOS SwiftPM packages', w.iosSpmPackages.length) })
    const modW = Math.max(0, ...w.iosSpmPackages.map((p) => p.module.length))
    for (const p of w.iosSpmPackages) {
      lines.push({ to: 'log', text: `    ${p.module.padEnd(modW)}  ${t.dim(arrow)} ${location(o, t, p.path)}` })
    }
    if (w.iosTargetSources.length > 0) {
      lines.push({ to: 'log', text: section('iOS co-located target sources', w.iosTargetSources.length) })
      for (const src of w.iosTargetSources) {
        lines.push({ to: 'log', text: `    [${src.module}]` })
        for (const d of src.dirs) lines.push({ to: 'log', text: `      ${location(o, t, d)}` })
      }
    }
  }
  const broken = wireBroken(o, w)
  if (broken.length > 0) lines.push(...(lines.length > 0 ? [blank('error')] : []), ...broken)
  lines.push(blank())
  const n = w.brokenDeclarations.length
  lines.push(
    n > 0
      ? { to: 'log', text: verdict(t, 'err', plural(n, 'broken native declaration'), [formatElapsed(w.elapsedMs)]) }
      : okVerdict(o, 'resolved native sources', w.elapsedMs, [
          plural(w.androidSrcDirs.length, 'Android srcDir'),
          plural(w.iosSpmPackages.length, 'SwiftPM package'),
          w.iosTargetSources.length > 0 ? plural(w.iosTargetSources.length, 'co-located module') : '',
        ]),
  )
  return lines
}

// ── dev ───────────────────────────────────────────────────────────────────

export type StepStatus = 'ok' | 'err' | 'skip'

export interface StepRow {
  label: string
  status: StepStatus
  elapsedMs?: number | undefined
  /** Dim note after the time (`12 files`, the device id). */
  note?: string | undefined
}

/**
 * `▸ label   ✓  6 ms  note`. The label column is padded to `labelWidth` (the
 * longest step this platform can print) and the time is right-aligned, so
 * rows line up as they stream in one by one.
 */
export function stepRow(t: Term, row: StepRow, labelWidth: number): string {
  const mark =
    row.status === 'ok'
      ? t.ok(t.sym('ok'))
      : row.status === 'err'
        ? `${t.err(t.sym('err'))} ${t.err('failed')}`
        : `${t.dim(t.sym('dash'))} ${t.dim('skipped')}`
  const time = row.elapsedMs === undefined ? '' : t.dim(formatElapsed(row.elapsedMs).padStart(7))
  const note = row.note ? `  ${t.dim(row.note)}` : ''
  return `  ${t.accent(t.sym('step'))} ${row.label.padEnd(labelWidth)}  ${mark}${time ? ` ${time}` : ''}${note}`.replace(/\s+$/, '')
}

/** A failed step's output under its row, indented and wrapped. */
export function stepDetail(t: Term, detail: string, width = WRAP_WIDTH): string[] {
  return detailLines(t, detail, width, '    ')
}

export const devHeader = (t: Term, label: string): string => header(t, `${CLI_NAME} dev`, label)

export function devWarnings(o: Out, target: TargetLanguage, warnings: readonly { file: string; warning: string }[]): string[] {
  const { t } = o
  const lines = [`  ${t.warn(t.sym('warn'))} ${t.warn(plural(warnings.length, 'compiler warning'))} ${t.dim(`${t.sym('dash')} these constructs will not run on the device`)}`]
  for (const w of warnings) {
    lines.push(...findingBlock(o, t, { severity: 'warning', word: 'warning', scope: target, message: w.warning, file: w.file }, 4))
  }
  return lines
}

export function devVerdict(t: Term, status: 'ok' | 'err', text: string, meta: string[]): string {
  return `  ${verdict(t, status, status === 'ok' ? t.bold(t.ok(text)) : text, meta)}`
}
