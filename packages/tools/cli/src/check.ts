/**
 * `pyreon check [paths...]` — fast, terminal-native Pyreon anti-pattern scan.
 *
 * Runs the compiler's static detectors over source files and prints each
 * finding with its inline fix:
 *   - `detectPyreonPatterns` — "using Pyreon wrong" footguns (signal-write-as-call,
 *     props-destructured, for-missing-by, …)
 *   - `detectReactPatterns`  — "from React" mistakes (useState, className, …)
 *
 * With no path args it scans the git-changed `.ts`/`.tsx` files (the pre-commit
 * inner-loop case); pass explicit files/dirs to scope it anywhere. Exits
 * non-zero when anything fires, so it doubles as a pre-commit / CI gate.
 *
 * Distinct from `pyreon doctor` (whole-project health + gates, slower) and
 * `pyreon lint` (the `@pyreon/lint` rule set): `check` is the fast, file-scoped
 * COMPILER-detector pass — the terminal-native twin of the MCP `validate` tool.
 * `--fix` applies the mechanically-safe auto-fixes (`migratePyreonCode` +
 * `migrateReactCode`) in place.
 *
 * Output: human text in the shared `@pyreon/ansi` theme (header, each
 * finding as `✗ code · message` / `↳ file:line:col` / `fix:`, verdict
 * last), `--json` for tools (byte-stable, locked) and
 * `--gha` for GitHub annotations.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  createTerm,
  finding as findingLines,
  formatElapsed,
  ghaAnnotation,
  header,
  nothingTo,
  plural,
  type Term,
  verdict,
} from '@pyreon/ansi'

export interface CheckOptions {
  /** Explicit file/dir args (may be empty → git-changed files). */
  paths: string[]
  cwd: string
  json: boolean
  fix: boolean
  /** GitHub Actions annotations instead of text (`--gha`). */
  gha?: boolean | undefined
}

export interface Finding {
  file: string
  line: number
  column: number
  code: string
  source: 'pyreon' | 'react'
  message: string
  suggested: string
  fixable: boolean
}

const SKIP_DIR = /(?:^|\/)(?:node_modules|lib|dist|build|\.git|coverage)(?:\/|$)/
const isSource = (f: string): boolean => /\.(?:tsx?|jsx?)$/.test(f) && !f.endsWith('.d.ts')


/** Files changed vs HEAD + untracked, filtered to source. Empty if not a git repo. */
function gitChangedFiles(cwd: string): string[] {
  const run = (args: string[]): string[] => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }
  const changed = [...run(['diff', '--name-only', 'HEAD']), ...run(['ls-files', '--others', '--exclude-standard'])]
  const seen = new Set<string>()
  const out: string[] = []
  for (const rel of changed) {
    if (!isSource(rel) || seen.has(rel)) continue
    seen.add(rel)
    const abs = resolve(cwd, rel)
    try {
      if (statSync(abs).isFile()) out.push(abs)
    } catch {
      // deleted/renamed — skip
    }
  }
  return out
}

/** Expand a path arg (file → itself; dir → recursive source files). */
function expandPath(p: string, cwd: string): string[] {
  const abs = isAbsolute(p) ? p : resolve(cwd, p)
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(abs)
  } catch {
    const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
    console.error(
      findingLines(t, { severity: 'error', source: 'pyreon check', message: `path not found: ${p}`, fix: 'pass an existing file or directory' }, { indent: 0, width: t.width }).join('\n'),
    )
    return []
  }
  if (st.isFile()) return isSource(abs) ? [abs] : []
  const out: string[] = []
  for (const entry of readdirSync(abs, { recursive: true, encoding: 'utf8' }) as string[]) {
    const rel = entry.replace(/\\/g, '/')
    if (SKIP_DIR.test(rel) || !isSource(rel)) continue
    const full = join(abs, entry)
    try {
      if (statSync(full).isFile()) out.push(full)
    } catch {
      // race — skip
    }
  }
  return out
}

function resolveTargets(opts: CheckOptions): { files: string[]; fromGit: boolean } {
  if (opts.paths.length > 0) {
    const files = [...new Set(opts.paths.flatMap((p) => expandPath(p, opts.cwd)))]
    return { files, fromGit: false }
  }
  return { files: gitChangedFiles(opts.cwd), fromGit: true }
}

export async function check(opts: CheckOptions): Promise<number> {
  const { detectPyreonPatterns, hasPyreonPatterns, detectReactPatterns, hasReactPatterns, migratePyreonCode, migrateReactCode } =
    await import('@pyreon/compiler/analyze')

  const started = performance.now()
  const { files, fromGit } = resolveTargets(opts)

  if (files.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ findings: [], fileCount: 0, findingCount: 0, fixedCount: 0 }, null, 2))
    } else if (!opts.gha) {
      console.log(renderCheckEmpty(createTerm(), fromGit))
    }
    return 0
  }

  let fixedCount = 0
  const findings: Finding[] = []

  for (const abs of files) {
    let code: string
    try {
      code = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    const rel = relative(opts.cwd, abs) || abs

    if (opts.fix) {
      const p = migratePyreonCode(code, rel)
      const r = migrateReactCode(p.code, rel)
      const fixedCode = r.code
      const n = p.changes.length + r.changes.length
      if (n > 0 && fixedCode !== code) {
        writeFileSync(abs, fixedCode, 'utf8')
        fixedCount += n
        code = fixedCode
      }
      // What the React migration left unconverted is not re-detectable from the
      // rewritten file (a state read at setup level is valid Pyreon that simply
      // never updates), so report it here, positioned in the written file.
      for (const m of r.manual) {
        findings.push({ file: rel, line: m.line, column: m.column, code: 'not-migrated', source: 'react', message: m.message, suggested: m.suggested, fixable: false })
      }
    }

    // Re-detect on the (possibly fixed) code so `--fix` reports only what remains.
    if (hasPyreonPatterns(code)) {
      for (const d of detectPyreonPatterns(code, rel)) {
        findings.push({ file: rel, line: d.line, column: d.column, code: d.code, source: 'pyreon', message: d.message, suggested: d.suggested, fixable: d.fixable })
      }
    }
    if (hasReactPatterns(code)) {
      for (const d of detectReactPatterns(code, rel)) {
        findings.push({ file: rel, line: d.line, column: d.column, code: d.code, source: 'react', message: d.message, suggested: d.suggested, fixable: d.fixable })
      }
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)

  if (opts.json) {
    console.log(JSON.stringify({ findings, fileCount: files.length, findingCount: findings.length, fixedCount }, null, 2))
    return findings.length > 0 ? 1 : 0
  }

  if (opts.gha) {
    console.log(renderCheckGha(findings))
    return findings.length > 0 ? 1 : 0
  }

  console.log(
    renderCheckText(createTerm(), {
      findings,
      fileCount: files.length,
      fixedCount,
      fromGit,
      fix: opts.fix,
      elapsedMs: performance.now() - started,
      cwd: opts.cwd,
    }),
  )
  return findings.length > 0 ? 1 : 0
}

/** What `renderCheckText` needs: the run's result, not its IO. */
export interface CheckRun {
  findings: readonly Finding[]
  fileCount: number
  fixedCount: number
  fromGit: boolean
  fix: boolean
  elapsedMs: number
  /** Resolves each relative path for its OSC 8 link. */
  cwd: string
}

/** The empty run: nothing changed (git default) and nothing matched (paths) have different remedies. */
export const renderCheckEmpty = (t: Term, fromGit: boolean): string =>
  fromGit
    ? nothingTo(t, 'No changed .ts/.tsx files to check', 'pass paths explicitly: pyreon check src/')
    : nothingTo(t, 'No source files matched', 'pass a .ts/.tsx/.js/.jsx file or a directory')

/**
 * The human report: header, then each finding as `✗ code · message` /
 * `↳ file:line:col` (an OSC 8 link) / `fix: …` (rule 4), sorted by file,
 * line and column, then the verdict.
 */
export function renderCheckText(t: Term, run: CheckRun): string {
  const scope = run.fromGit ? 'git-changed files' : 'paths'
  const lines = [header(t, 'pyreon check', `${plural(run.fileCount, 'file')} ${t.sym('bullet')} ${scope}${run.fix ? ` ${t.sym('bullet')} --fix` : ''}`)]
  if (run.fixedCount > 0) {
    lines.push(`  ${t.ok(t.sym('ok'))} applied ${plural(run.fixedCount, 'auto-fix', 'auto-fixes')}`)
  }
  const elapsed = formatElapsed(run.elapsedMs)
  if (run.findings.length === 0) {
    lines.push('', verdict(t, 'ok', `no Pyreon anti-patterns in ${plural(run.fileCount, 'file')}`, [elapsed]))
    return lines.join('\n')
  }
  for (const f of run.findings) {
    lines.push('')
    const fix = f.suggested
      ? `${f.suggested}${f.fixable ? ` ${t.dim('(auto-fixable: run with --fix)')}` : ''}`
      : f.fixable
        ? 'run with --fix'
        : undefined
    lines.push(
      ...findingLines(
        t,
        {
          severity: 'error',
          source: f.source === 'react' ? `react:${f.code}` : f.code,
          message: f.message,
          location: {
            path: f.file,
            abs: isAbsolute(f.file) ? f.file : resolve(run.cwd, f.file),
            line: f.line,
            column: f.column,
          },
          fix,
        },
        { indent: 2, width: t.width },
      ),
    )
  }
  const fileWord = new Set(run.findings.map((f) => f.file)).size
  const fixable = run.findings.filter((f) => f.fixable).length
  lines.push(
    '',
    verdict(t, 'err', `${plural(run.findings.length, 'finding')} in ${plural(fileWord, 'file')}`, [
      fixable > 0 && `${fixable} auto-fixable with --fix`,
      `${plural(run.fileCount, 'file')} checked`,
      elapsed,
    ]),
  )
  return lines.join('\n')
}

/** `--gha`: one `::error` annotation per finding, the fix after an em dash. */
export const renderCheckGha = (findings: readonly Finding[]): string =>
  findings
    .map((f) =>
      ghaAnnotation({
        level: 'error',
        title: f.source === 'react' ? `react:${f.code}` : f.code,
        file: f.file,
        line: f.line,
        column: f.column,
        message: f.suggested ? `${f.message} — ${f.suggested}` : f.message,
      }),
    )
    .join('\n')
