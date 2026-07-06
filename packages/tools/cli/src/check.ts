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
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export interface CheckOptions {
  /** Explicit file/dir args (may be empty → git-changed files). */
  paths: string[]
  cwd: string
  json: boolean
  fix: boolean
}

interface Finding {
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

const useColor = (): boolean => !!process.stdout.isTTY && !process.env.NO_COLOR
// ESC computed so the SOURCE carries no raw C0 control byte (source-hygiene gate).
const ESC = String.fromCharCode(27)
const paint = (s: string, code: string): string => (useColor() ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const bold = (s: string) => paint(s, '1')
const dim = (s: string) => paint(s, '2')
const red = (s: string) => paint(s, '31')
const green = (s: string) => paint(s, '32')
const yellow = (s: string) => paint(s, '33')
const cyan = (s: string) => paint(s, '36')

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
    console.error(red(`  path not found: ${p}`))
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
    await import('@pyreon/compiler')

  const { files, fromGit } = resolveTargets(opts)

  if (files.length === 0) {
    if (opts.json) {
      console.log(JSON.stringify({ findings: [], fileCount: 0, findingCount: 0, fixedCount: 0 }, null, 2))
    } else if (fromGit) {
      console.log(dim('  No changed .ts/.tsx files to check. Pass paths explicitly: `pyreon check src/`'))
    } else {
      console.log(dim('  No source files matched.'))
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

  if (opts.fix && fixedCount > 0) {
    console.log(green(`  ✓ applied ${fixedCount} auto-fix${fixedCount === 1 ? '' : 'es'}`))
  }

  if (findings.length === 0) {
    console.log(green(`  ✓ no Pyreon anti-patterns in ${files.length} file${files.length === 1 ? '' : 's'}`))
    return 0
  }

  let currentFile = ''
  for (const f of findings) {
    if (f.file !== currentFile) {
      currentFile = f.file
      console.log(`\n  ${bold(cyan(f.file))}`)
    }
    const loc = dim(`${f.line}:${f.column}`)
    const tag = f.source === 'react' ? yellow(`[react:${f.code}]`) : yellow(`[${f.code}]`)
    const fixHint = f.fixable ? green(' (auto-fixable — run with --fix)') : ''
    console.log(`    ${loc}  ${tag}${fixHint}`)
    console.log(`      ${f.message}`)
    if (f.suggested) console.log(`      ${dim('→')} ${green(f.suggested)}`)
  }

  const fileWord = new Set(findings.map((f) => f.file)).size
  console.log(
    `\n  ${red(`${findings.length} finding${findings.length === 1 ? '' : 's'}`)} in ${fileWord} file${fileWord === 1 ? '' : 's'}` +
      (findings.some((f) => f.fixable) ? dim('  ·  some are auto-fixable with --fix') : ''),
  )
  return 1
}
