/**
 * Doc-claims gate — programmatic API.
 *
 * Catches numeric-drift between human-written docs and the underlying
 * source of truth. Recurring failure mode: a hand-quoted count
 * ("34 signal-based hooks…") appears in 3-5 places; one bumps when a
 * new hook lands, the others don't. Audit caught the README claiming
 * 16 vs actual 34 — drift that shipped to users for weeks.
 *
 * Five counters today: hook-export, doc-page, lint-rule, lint-category,
 * detector-code. All TEXT-PARSE in-repo source via `repoRoot` (NOT
 * `import`, which resolves to a stale bun cache snapshot). A ClaimSpec
 * may set `all: true` to assert every occurrence of the pattern in a
 * file agrees, for files that repeat the same count string.
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
  /**
   * Assert EVERY occurrence of the pattern in the file agrees (not just
   * the first). Required for files that repeat the same count string —
   * e.g. `lint/src/manifest.ts` carries the rule count 5× (3 prose + 2
   * `--list` help comments); bumping 4 of 5 would otherwise pass silent.
   */
  all?: boolean
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

// NOTE: these counters TEXT-PARSE the in-repo source rather than
// `import { allRules } from '@pyreon/lint'`. A dynamic import resolves
// via bun's module cache, which in a worktree/CI checkout points at a
// STALE published snapshot (observed: 0.18.0 cache → 66 rules while the
// working tree had 76). A doc-claims gate that asserts against a stale
// cache is worse than no gate. `repoRoot`-relative file reads are the
// only resolution that reflects the branch under test — same approach
// `countHookExports` / `countDocPages` already use.

const countLintRules = (repoRoot: string): number => {
  const idx = join(repoRoot, 'packages/tools/lint/src/rules/index.ts')
  if (!existsSync(idx)) return 0
  const src = readFileSync(idx, 'utf8')
  const m = src.match(/export const allRules: Rule\[\] = \[([\s\S]*?)\n\]/)
  if (!m?.[1]) return 0
  // One bare identifier per line; skip `// Category (n)` headers + blanks.
  return m[1]
    .split('\n')
    .filter((l) => /^\s+[a-zA-Z][a-zA-Z0-9]*,?\s*$/.test(l)).length
}

const countLintCategories = (repoRoot: string): number => {
  const rulesDir = join(repoRoot, 'packages/tools/lint/src/rules')
  if (!existsSync(rulesDir)) return 0
  const cats = new Set<string>()
  for (const cat of readdirSync(rulesDir)) {
    const sub = join(rulesDir, cat)
    let isDir = false
    try {
      isDir = statSync(sub).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    for (const f of readdirSync(sub)) {
      if (!f.endsWith('.ts')) continue
      const m = readFileSync(join(sub, f), 'utf8').match(
        /category:\s*'([a-z0-9-]+)'/,
      )
      if (m?.[1]) cats.add(m[1])
    }
  }
  return cats.size
}

const countDetectorCodes = (repoRoot: string): number => {
  const file = join(repoRoot, 'packages/core/compiler/src/pyreon-intercept.ts')
  if (!existsSync(file)) return 0
  const src = readFileSync(file, 'utf8')
  const m = src.match(
    /export type PyreonDiagnosticCode =\n((?:\s*\|\s*'[a-z0-9-]+'\n?)+)/,
  )
  if (!m?.[1]) return 0
  return (m[1].match(/\|\s*'[a-z0-9-]+'/g) ?? []).length
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
  {
    name: 'lint rule count',
    codeId: 'lint-rule-count',
    actual: countLintRules,
    claims: [
      {
        file: 'CLAUDE.md',
        pattern: /Pyreon-specific linter — (\d+) rules, \d+ categories/,
      },
      {
        file: 'CLAUDE.md',
        pattern: /returns metadata for all (\d+) rules/,
      },
      {
        file: 'CLAUDE.md',
        pattern: /^- (\d+) rules across \d+ categories: reactivity/m,
      },
      {
        file: 'packages/tools/lint/README.md',
        pattern: /— (\d+) rules across \d+ categories/,
      },
      {
        file: 'docs/docs/lint.md',
        pattern: /Pyreon-specific linter — (\d+) rules for signals/,
      },
      {
        // 5 occurrences (3 prose + 2 CLI-help comments) — all must agree.
        file: 'packages/tools/lint/src/manifest.ts',
        pattern: /(\d+) rules(?: across \d+ categories| total|\b)/,
        all: true,
      },
    ],
  },
  {
    name: 'lint category count',
    codeId: 'lint-category-count',
    actual: countLintCategories,
    claims: [
      {
        file: 'CLAUDE.md',
        pattern: /Pyreon-specific linter — \d+ rules, (\d+) categories/,
      },
      {
        file: 'CLAUDE.md',
        pattern: /^- \d+ rules across (\d+) categories: reactivity/m,
      },
      {
        file: 'packages/tools/lint/README.md',
        pattern: /— \d+ rules across (\d+) categories/,
      },
      {
        file: 'packages/tools/lint/src/manifest.ts',
        pattern: /\d+ rules across (\d+) categories/,
        all: true,
      },
    ],
  },
  {
    name: 'detector code count',
    codeId: 'detector-code-count',
    actual: countDetectorCodes,
    claims: [
      {
        file: '.claude/rules/anti-patterns.md',
        pattern: /flags (\d+) of the patterns below statically/,
      },
      {
        file: 'CLAUDE.md',
        pattern:
          /catches "using Pyreon wrong" mistakes — (\d+) detector codes today/,
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

      if (claim.all) {
        const gre = new RegExp(
          claim.pattern.source,
          claim.pattern.flags.includes('g')
            ? claim.pattern.flags
            : claim.pattern.flags + 'g',
        )
        const matches = [...content.matchAll(gre)]
        if (matches.length === 0) {
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
        for (const mm of matches) {
          const n = parseInt(mm[1] ?? '', 10)
          if (n !== actual) {
            findings.push({
              category: 'documentation',
              severity: 'error',
              code: `doc-claims/${check.codeId}-drift`,
              gate: 'doc-claims',
              message: `${check.name}: ${claim.file} claims ${Number.isNaN(n) ? '(unparseable)' : n} (one of ${matches.length} occurrences), actual ${actual}.`,
              location: { path: filePath, relPath },
              fix: `Update every occurrence in ${claim.file} to ${actual}`,
            })
          }
        }
        continue
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
