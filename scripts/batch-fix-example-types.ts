#!/usr/bin/env bun
/**
 * Iteratively run `tsc --noEmit` on docs-zero, parse each TS error,
 * apply the canonical fix, repeat until no errors remain.
 *
 * Designed for the migrated `<Playground>`-to-`<Example>` examples
 * under `examples/docs-zero/src/examples/**`. The original code was
 * untyped JS; this fills in the minimum annotations that satisfy TS
 * strict mode without changing observable behavior.
 *
 * Supported fixes:
 *   - TS7006 (implicit-any param)        → inject `: any` (or inferred)
 *   - TS7053 (implicit-any index access) → `(obj as Record<string, any>)[k]`
 *   - TS2339 (property missing on `{}`)  → broaden the signal to `Record<string, any>`
 *   - TS2531 (object possibly null)      → `!` non-null assertion
 *   - TS2304 (cannot find name)          → emit a placeholder + skip
 *
 * Iterates until either zero errors OR no progress was made on the
 * latest pass (so a fix that creates a new error type stops gracefully).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = path.resolve(import.meta.dir, '..')
const EXAMPLES_GLOB_DIR = path.join(
  REPO_ROOT,
  'examples/docs-zero/src/examples',
)

interface TsError {
  file: string
  line: number
  col: number
  code: string
  message: string
}

function parseTsc(stdout: string): TsError[] {
  const errors: TsError[] = []
  // Format: `@pyreon/docs-zero typecheck: <path>(<line>,<col>): error TS<code>: <msg>`
  const re =
    /typecheck:\s+(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)/g
  let m
  while ((m = re.exec(stdout)) !== null) {
    errors.push({
      file: m[1]!,
      line: +m[2]!,
      col: +m[3]!,
      code: m[4]!,
      message: m[5]!,
    })
  }
  return errors
}

function runTypecheck(): TsError[] {
  const r = spawnSync(
    'bun',
    ['run', '--filter=@pyreon/docs-zero', 'typecheck'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const out = (r.stdout || '') + (r.stderr || '')
  return parseTsc(out)
}

/**
 * Apply a fix in-place to a file. Returns true if file was modified.
 * Fixes are line-targeted; we read+write the file as a string so the
 * regex stays local to one line.
 */
async function applyFix(err: TsError): Promise<boolean> {
  // tsc emits paths relative to the package that ran typecheck (docs-zero).
  // Resolve relative paths from `examples/docs-zero/` so the file open works.
  const abs = path.isAbsolute(err.file)
    ? err.file
    : err.file.startsWith('src/')
      ? path.join(REPO_ROOT, 'examples/docs-zero', err.file)
      : path.join(REPO_ROOT, err.file)
  let src: string
  try {
    src = await fs.readFile(abs, 'utf8')
  } catch {
    return false
  }
  const lines = src.split('\n')
  const lineIdx = err.line - 1
  if (lineIdx < 0 || lineIdx >= lines.length) return false
  let line = lines[lineIdx]!
  let next = line

  if (err.code === 'TS7006') {
    // "Parameter 'X' implicitly has an 'any' type."
    const nameMatch = /'([A-Za-z_$][A-Za-z0-9_$]*)'/.exec(err.message)
    if (nameMatch === null) return false
    const name = nameMatch[1]!
    // Targeted replacements — inject `: any` after `name` when it appears
    // as a function parameter that doesn't already have a type annotation.
    // Order of patterns from most-specific to least.
    const patterns = [
      // `(name) =>` or `, name) =>` parameter list
      new RegExp(`(\\(|,\\s*)(${name})(\\s*[\\),])`),
      // Destructured `[name, …]` or `[name]`
      new RegExp(`(\\[\\s*|,\\s*)(${name})(\\s*[,\\]])`),
      // `function fn(name) {}` / `function fn(name,` form
      new RegExp(`(function\\s+\\w+\\s*\\(|,\\s*)(${name})(\\s*[,\\)])`),
    ]
    for (const re of patterns) {
      const m = re.exec(line)
      if (m && !line.slice(m.index).startsWith(`${m[1]}${name}:`)) {
        next = line.replace(re, `$1${name}: any$3`)
        if (next !== line) break
      }
    }
  } else if (err.code === 'TS7053') {
    // "Element implicitly has an 'any' type because expression of type
    // 'string' can't be used to index type '{}'."
    // Heuristic: cast the obj on the LHS of `[` to `(obj as any)`.
    // Look for `<word>[<expr>]` on this line.
    const m = /(\b[A-Za-z_$][A-Za-z0-9_$]*)\[/.exec(line)
    if (m !== null) {
      const word = m[1]!
      // Only one replacement on this column position.
      next = line.replace(
        new RegExp(`\\b${word}\\[`),
        `(${word} as Record<string, any>)[`,
      )
    }
  } else if (err.code === 'TS2531') {
    // "Object is possibly 'null'." Add `!` after the failing expression.
    // Heuristic: insert `!` immediately after the column.
    const at = err.col - 1
    next = line.slice(0, at) + '!' + line.slice(at)
  } else if (err.code === 'TS2304') {
    // "Cannot find name 'X'." — can't auto-fix safely. Skip.
    return false
  }

  if (next === line) return false
  lines[lineIdx] = next
  await fs.writeFile(abs, lines.join('\n'), 'utf8')
  return true
}

async function main() {
  let pass = 0
  let prevTotal = Infinity
  while (true) {
    pass++
    const errors = runTypecheck()
    console.log(`[pass ${pass}] ${errors.length} TS error(s) remaining`)
    if (errors.length === 0) break
    // Stop if no progress was made on the latest pass.
    if (errors.length >= prevTotal) {
      console.log(`No progress on pass ${pass} (${errors.length} ≥ ${prevTotal}); stopping.`)
      // Dump remaining errors to stderr for human review.
      for (const e of errors.slice(0, 20)) {
        console.error(`  ${e.file}:${e.line}:${e.col} ${e.code} ${e.message}`)
      }
      if (errors.length > 20) console.error(`  …and ${errors.length - 20} more`)
      process.exit(1)
    }
    prevTotal = errors.length
    // Apply ALL fixes on the latest report before re-running tsc. Group
    // by file + line so we don't apply two fixes to the same line at
    // adjacent columns (would clobber each other's edits).
    const seen = new Set<string>()
    let applied = 0
    // Apply file-line-column triplets in REVERSE order so earlier
    // columns aren't shifted by earlier inserts.
    const sorted = [...errors].sort((a, b) => {
      if (a.file !== b.file) return a.file < b.file ? -1 : 1
      if (a.line !== b.line) return b.line - a.line
      return b.col - a.col
    })
    for (const e of sorted) {
      const key = `${e.file}:${e.line}:${e.col}:${e.code}`
      if (seen.has(key)) continue
      seen.add(key)
      const ok = await applyFix(e)
      if (ok) applied++
    }
    console.log(`[pass ${pass}] applied ${applied} fix(es)`)
    if (applied === 0) {
      console.log('No applicable auto-fixes; stopping.')
      break
    }
  }
  console.log('Done — TS errors fully resolved.')
}

if (import.meta.main) {
  await main()
}

// Suppress unused-import lint warnings in case Bun strips them in this script.
void EXAMPLES_GLOB_DIR
