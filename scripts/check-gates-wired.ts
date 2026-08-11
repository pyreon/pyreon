#!/usr/bin/env bun
/**
 * A gate script that nothing runs is not a gate.
 *
 * ## The failure this catches
 *
 * `scripts/check-native-runtime-parity.ts` was written to enforce that the
 * Swift and Kotlin runtimes' `VERSION` constants move together — its own
 * header says "Wired into a CI job to gate PRs that touch either runtime".
 * It never was. It sat in the repo for months, fully working, protecting
 * nothing, and nobody could tell: an unwired gate produces no output, no
 * failure, and no absence anyone notices.
 *
 * That is the same class as a red gate or a gate that cannot fail — it
 * advertises protection that does not exist — except quieter, because a red
 * gate at least shows up somewhere.
 *
 * ## What "wired" means
 *
 * Referenced by at least one thing that actually RUNS: `validate-fast`, a
 * `package.json` script, a GitHub workflow, or a git hook. A gate reachable
 * only from another gate is still wired, because the outer one is checked
 * here too.
 *
 * ## Why a list of exemptions rather than a stricter rule
 *
 * A few `check-*.ts` scripts are genuinely libraries or manual tools — run by
 * hand during a release, or imported by another script. Those declare
 * themselves here with a reason, and the list is a RATCHET: an entry whose
 * file is gone fails, so it cannot outlive its justification.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')

/**
 * Scripts that legitimately have no runner.
 *
 * Each needs a reason. "It is not wired yet" is not one — that is the bug.
 */
const EXEMPT: Record<string, string> = {
  // (empty today — every check-*.ts is reachable)
}

/**
 * Strip comments before scanning.
 *
 * Load-bearing, and found by bisect: this file's own header names
 * `check-native-runtime-parity` while explaining the bug it was written for,
 * and a naive substring scan counted that PROSE as wiring — so unwiring the
 * gate for real still passed. A comment cannot run anything, and a gate whose
 * documentation satisfies its own check is worse than no gate.
 *
 * Deliberately crude: this only needs to remove text that cannot be an
 * invocation, and a real parser here would be cost with no benefit. Strings
 * are left alone because an invocation IS a string (`'bun scripts/x.ts'`).
 */
function stripComments(source: string, kind: 'ts' | 'yml'): string {
  if (kind === 'yml') {
    return source
      .split('\n')
      .map((line) => {
        const hash = line.indexOf('#')
        // A `#` inside quotes is not a comment; keep the line whole if the
        // prefix has an odd number of quotes.
        if (hash === -1) return line
        const before = line.slice(0, hash)
        const quotes = (before.match(/['"]/g) ?? []).length
        return quotes % 2 === 1 ? line : before
      })
      .join('\n')
  }
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Files that, if they INVOKE a gate, count as wiring it. */
function runnerSources(): string[] {
  const out: string[] = []
  const add = (p: string) => {
    if (existsSync(p)) out.push(p)
  }
  add(join(REPO_ROOT, 'package.json'))
  add(join(REPO_ROOT, 'scripts', 'validate-fast.ts'))
  const hooks = join(REPO_ROOT, '.githooks')
  if (existsSync(hooks)) for (const f of readdirSync(hooks)) add(join(hooks, f))
  const wf = join(REPO_ROOT, '.github', 'workflows')
  if (existsSync(wf)) for (const f of readdirSync(wf)) if (f.endsWith('.yml')) add(join(wf, f))
  // Other gate scripts: one gate invoking another is still wiring, provided
  // the outer one is itself wired — which this same check establishes.
  const scripts = join(REPO_ROOT, 'scripts')
  for (const f of readdirSync(scripts)) if (f.endsWith('.ts')) add(join(scripts, f))
  return out
}

export function findUnwiredGates(): string[] {
  const scriptsDir = join(REPO_ROOT, 'scripts')
  const gates = readdirSync(scriptsDir)
    .filter((f) => f.startsWith('check-') && f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort()

  const sources = runnerSources()
  const unwired: string[] = []
  for (const gate of gates) {
    if (gate in EXEMPT) continue
    const referenced = sources.some((src) => {
      // A gate never counts as wiring ITSELF.
      if (src.endsWith(`${gate}.ts`)) return false
      try {
        const raw = readFileSync(src, 'utf8')
        const code = stripComments(raw, src.endsWith('.yml') ? 'yml' : 'ts')
        // The INVOCATION shape, not a bare mention: `scripts/<gate>.ts`.
        return code.includes(`scripts/${gate}.ts`)
      } catch {
        return false
      }
    })
    if (!referenced) unwired.push(gate)
  }
  return unwired
}

/** Exemptions whose file no longer exists — the ratchet half. */
export function staleExemptions(): string[] {
  return Object.keys(EXEMPT).filter(
    (name) => !existsSync(join(REPO_ROOT, 'scripts', `${name}.ts`)),
  )
}

const unwired = findUnwiredGates()
const stale = staleExemptions()

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ unwired, staleExemptions: stale }, null, 2))
} else if (unwired.length === 0 && stale.length === 0) {
  const total = readdirSync(join(REPO_ROOT, 'scripts')).filter(
    (f) => f.startsWith('check-') && f.endsWith('.ts'),
  ).length
  console.log(`✓ All ${total} gate script(s) are wired to something that runs them.`)
} else {
  if (unwired.length > 0) {
    console.error(`✗ ${unwired.length} gate script(s) that NOTHING runs:\n`)
    for (const g of unwired) console.error(`  scripts/${g}.ts`)
    console.error(
      `\n  A gate nothing runs protects nothing, and says so to no one.\n` +
        `  Fix: add it to scripts/validate-fast.ts, a package.json script, or a\n` +
        `  workflow — or add it to EXEMPT in this file with a reason.\n`,
    )
  }
  if (stale.length > 0) {
    console.error(`✗ ${stale.length} EXEMPT entr(y/ies) whose script is gone:\n`)
    for (const g of stale) console.error(`  ${g}`)
    console.error(`\n  Remove the entry — an exemption must not outlive its file.\n`)
  }
}

process.exit(unwired.length + stale.length > 0 ? 1 : 0)
