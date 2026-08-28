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

export interface PlainOptions {
  paths: string[]
  cwd: string
  json: boolean
  write: boolean
}

const SKIP_DIR = /(?:^|\/)(?:node_modules|lib|dist|build|\.git|coverage)(?:\/|$)/
const isSource = (f: string): boolean => /\.(?:tsx?|jsx?)$/.test(f) && !f.endsWith('.d.ts')

const useColor = (): boolean => !!process.stdout.isTTY && !process.env.NO_COLOR
// ESC computed so the SOURCE carries no raw C0 control byte (source-hygiene gate).
const ESC = String.fromCharCode(27)
const paint = (s: string, code: string): string => (useColor() ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const bold = (s: string) => paint(s, '1')
const dim = (s: string) => paint(s, '2')
const green = (s: string) => paint(s, '32')
const yellow = (s: string) => paint(s, '33')
const cyan = (s: string) => paint(s, '36')

function expandPath(p: string, cwd: string): string[] {
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
      else if (s.isFile() && isSource(full)) out.push(full)
    }
  }
  walk(abs)
  return out
}

type FileStatus = 'already-plain' | 'full' | 'partial' | 'declined' | 'nothing'

interface FileReport {
  file: string
  status: FileStatus
  converted: string[]
  declined: Array<{ name: string; code: string; reason: string; line: number; column: number }>
  written: boolean
}

export async function plain(opts: PlainOptions): Promise<number> {
  const { migrateToPlain } = await import('@pyreon/compiler')

  const targets =
    opts.paths.length > 0
      ? [...new Set(opts.paths.flatMap((p) => expandPath(p, opts.cwd)))]
      : expandPath(opts.cwd, opts.cwd)

  if (targets.length === 0) {
    console.log(dim('  No source files matched.'))
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
          },
          declinedHistogram: Object.fromEntries(histogram),
        },
        null,
        2,
      ),
    )
    return 0
  }

  console.log(bold('\n  Plain Mode readiness\n'))
  for (const r of reports) {
    if (r.status === 'nothing') continue
    const label =
      r.status === 'already-plain'
        ? green('✓ already plain')
        : r.status === 'full'
          ? green(`✓ converts fully (${r.converted.length} binding${r.converted.length === 1 ? '' : 's'})`)
          : r.status === 'partial'
            ? yellow(`◐ partial (${r.converted.length} convert, ${r.declined.length} declined)`)
            : yellow(`✗ declined (${r.declined.length})`)
    console.log(`  ${cyan(r.file)} ${label}${r.written ? green('  → written') : ''}`)
    for (const d of r.declined) {
      console.log(dim(`      ${d.line}:${d.column} [${d.code}] ${d.reason}`))
    }
  }

  const convertible = by('full').length + by('partial').length
  console.log(
    `\n  ${bold(String(reports.length))} file(s) scanned · ${green(String(by('already-plain').length))} already plain · ` +
      `${green(String(convertible))} convertible · ${yellow(String(by('declined').length))} declined · ` +
      `${dim(String(by('nothing').length))} nothing to convert`,
  )
  if (histogram.size > 0) {
    console.log(bold('\n  Declined shapes (build-next histogram):'))
    for (const [code, n] of [...histogram.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${yellow(code.padEnd(20))} ${n}`)
    }
  }
  if (!opts.write && convertible > 0) {
    console.log(dim(`\n  Run \`pyreon plain${opts.paths.length ? ` ${opts.paths.join(' ')}` : ''} --write\` to apply.`))
  }
  console.log('')
  return 0
}
