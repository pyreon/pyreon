/**
 * Doc-claims gate — programmatic API.
 *
 * Catches numeric-drift between human-written docs and the underlying
 * source of truth. Recurring failure mode: a hand-quoted count
 * ("34 signal-based hooks…") appears in 3-5 places; one bumps when a
 * new hook lands, the others don't. Audit caught the README claiming
 * 16 vs actual 34 — drift that shipped to users for weeks.
 *
 * Pure function — `scripts/check-doc-claims.ts` wraps this for the
 * standalone CLI invocation.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding, GateResult } from '../types'

interface ClaimSpec {
  /** Doc file relative to repo root */
  file: string
  /** Capture group 1 must contain the number */
  pattern: RegExp
  /** Optional pattern variant for "X+" hedged claims (also wrong) */
  rejectHedged?: RegExp
}

interface ClaimCheck {
  /** Human-readable name shown in findings */
  name: string
  /** Stable code suffix used in `Finding.code` */
  codeId: string
  /** Source-of-truth function — produces the actual count */
  actual: (repoRoot: string) => number
  /** Doc files that carry the claim */
  claims: ClaimSpec[]
}

const countHookExports = (repoRoot: string): number => {
  const indexPath = join(repoRoot, 'packages/fundamentals/hooks/src/index.ts')
  if (!existsSync(indexPath)) return 0
  const source = readFileSync(indexPath, 'utf8')
  const matched = source.matchAll(
    /^export \{ (?:default as )?(use[A-Z][a-zA-Z]+) \}/gm,
  )
  const names = new Set<string>()
  for (const [, name] of matched) {
    if (name) names.add(name)
  }
  return names.size
}

const countDocPages = (repoRoot: string): number => {
  const docsDir = join(repoRoot, 'docs')
  if (!existsSync(docsDir)) return 0
  let count = 0
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (
        name === 'node_modules' ||
        name === 'cache' ||
        name === 'dist' ||
        name.startsWith('.')
      ) {
        continue
      }
      const full = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) walk(full)
      else if (name.endsWith('.md')) count++
    }
  }
  walk(docsDir)
  return count
}

const checks: ClaimCheck[] = [
  {
    name: 'hook export count',
    codeId: 'hook-count',
    actual: countHookExports,
    claims: [
      {
        file: 'packages/fundamentals/hooks/README.md',
        pattern: /^(\d+) signal-based reactive utilities/m,
      },
      {
        file: 'packages/fundamentals/hooks/src/manifest.ts',
        pattern: /'(\d+) signal-based hooks:/,
      },
      {
        file: 'packages/fundamentals/hooks/src/manifest.ts',
        pattern: /Signal-based hooks for Pyreon — (\d+) reactive primitives/,
      },
      {
        file: 'CLAUDE.md',
        pattern: /\| `@pyreon\/hooks` *\| (\d+) signal-based hooks/,
        rejectHedged: /\| `@pyreon\/hooks` *\| (\d+)\+ signal-based hooks/,
      },
      {
        file: 'CLAUDE.md',
        pattern: /^- (\d+) signal-based hooks across 6 categories/m,
      },
      {
        file: 'docs/docs/index.md',
        pattern: /\| (\d+) signal-based hooks for common UI patterns/,
      },
    ],
  },
  {
    name: 'doc page count',
    codeId: 'doc-count',
    actual: countDocPages,
    claims: [
      {
        file: 'CLAUDE.md',
        pattern: /(\d+) doc pages covering all packages/,
      },
    ],
  },
]

export interface DocClaimsGateOptions {
  /** Repository root directory */
  cwd: string
}

export const runDocClaimsGate = async (
  opts: DocClaimsGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []

  // The claim sites are Pyreon-monorepo-specific paths (hooks README,
  // CLAUDE.md, docs/docs/index.md, etc.). In a downstream consumer
  // project NONE of them exist — firing the gate would emit a flood of
  // spurious file-missing errors that don't reflect any real problem.
  // Skip when zero claim files are present: signal that the gate
  // doesn't apply rather than blame the user for not being Pyreon.
  const anyClaimExists = checks.some((c) =>
    c.claims.some((cl) => existsSync(join(opts.cwd, cl.file))),
  )
  if (!anyClaimExists) {
    return {
      gate: 'doc-claims',
      category: 'documentation',
      findings: [],
      meta: {
        scanned: 0,
        elapsedMs: Date.now() - start,
        skipped: true,
        skipReason:
          'no claim sites found in this project (gate targets Pyreon monorepo paths)',
      },
    }
  }

  for (const check of checks) {
    const actual = check.actual(opts.cwd)
    for (const claim of check.claims) {
      const filePath = join(opts.cwd, claim.file)
      const relPath = claim.file

      if (!existsSync(filePath)) {
        findings.push({
          category: 'documentation',
          severity: 'error',
          code: `doc-claims/${check.codeId}-file-missing`,
          gate: 'doc-claims',
          message: `${check.name}: claim file ${claim.file} not found (claim may have been deleted or moved). Actual: ${actual}.`,
          location: { path: filePath, relPath },
        })
        continue
      }
      const content = readFileSync(filePath, 'utf8')

      if (claim.rejectHedged) {
        const hedged = content.match(claim.rejectHedged)
        if (hedged?.[1]) {
          findings.push({
            category: 'documentation',
            severity: 'error',
            code: `doc-claims/${check.codeId}-hedged`,
            gate: 'doc-claims',
            message: `${check.name}: rejected hedged claim "${hedged[1]}+" in ${claim.file} — write the exact count instead. Actual: ${actual}.`,
            location: { path: filePath, relPath },
            fix: `Replace "${hedged[1]}+" with "${actual}"`,
          })
          continue
        }
      }

      const match = content.match(claim.pattern)
      const claimedRaw = match?.[1]
      if (!claimedRaw) {
        findings.push({
          category: 'documentation',
          severity: 'warning',
          code: `doc-claims/${check.codeId}-pattern-miss`,
          gate: 'doc-claims',
          message: `${check.name}: pattern not found in ${claim.file} (claim was likely deleted or rephrased). Actual: ${actual}.`,
          location: { path: filePath, relPath },
        })
        continue
      }
      const claimed = parseInt(claimedRaw, 10)
      if (claimed !== actual) {
        findings.push({
          category: 'documentation',
          severity: 'error',
          code: `doc-claims/${check.codeId}-drift`,
          gate: 'doc-claims',
          message: `${check.name}: ${claim.file} claims ${claimed}, actual ${actual}.`,
          location: { path: filePath, relPath },
          fix: `Update the claim in ${claim.file} from ${claimed} to ${actual}`,
        })
      }
    }
  }

  return {
    gate: 'doc-claims',
    category: 'documentation',
    findings,
    meta: {
      scanned: checks.reduce((n, c) => n + c.claims.length, 0),
      elapsedMs: Date.now() - start,
    },
  }
}
