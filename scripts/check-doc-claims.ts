#!/usr/bin/env bun
/**
 * check-doc-claims — assert numeric claims in human-written docs
 * stay in sync with the underlying code.
 *
 * Two recurring drift modes this catches:
 *
 *  1. **Hook count.** `@pyreon/hooks` ships N hook functions.
 *     `packages/fundamentals/hooks/README.md`, `src/manifest.ts`,
 *     and `CLAUDE.md` each carry a numeric claim ("34 signal-based
 *     hooks…"). When a new hook lands, it's easy to add the export
 *     and forget to bump every claim. The audit caught the README at
 *     16 vs actual 34 — a drift that lasted long enough to ship to
 *     users.
 *
 *  2. **Doc page count.** `CLAUDE.md` quotes "73 doc pages" as a
 *     hand-maintained number. Adding a new doc page in
 *     `docs/**\/*.md` doesn't touch CLAUDE.md, so the claim slowly
 *     drifts. The audit caught it at 58 vs actual 73.
 *
 * The gate is intentionally narrow: it only checks claims with
 * known canonical sources. Adding a new claim means adding a new
 * `claim` entry below — not a per-package framework.
 *
 * Run:
 *   bun run check-doc-claims          # exit non-zero if drift
 *   bun run check-doc-claims --json   # machine-readable
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')

interface ClaimCheck {
  /** Human-readable name shown in errors */
  name: string
  /** Source-of-truth function — produces the actual count */
  actual: () => number
  /** Doc files that carry the claim, with the regex that locates the number */
  claims: Array<{
    file: string
    /** Capture group 1 must contain the number */
    pattern: RegExp
    /** Optional pattern variant for "X+" hedged claims (also wrong post-fix) */
    rejectHedged?: RegExp
  }>
}

// ─── Source-of-truth counters ──────────────────────────────────────────

function countHookExports(): number {
  const indexPath = join(REPO_ROOT, 'packages/fundamentals/hooks/src/index.ts')
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

function countDocPages(): number {
  const docsDir = join(REPO_ROOT, 'docs')
  let count = 0
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      // Skip vitepress build artifacts + node_modules
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
      if (isDir) {
        walk(full)
      } else if (name.endsWith('.md')) {
        count++
      }
    }
  }
  walk(docsDir)
  return count
}

// ─── Claim definitions ─────────────────────────────────────────────────

const checks: ClaimCheck[] = [
  {
    name: 'hook export count',
    actual: countHookExports,
    claims: [
      {
        file: 'packages/fundamentals/hooks/README.md',
        pattern: /^(\d+) signal-based reactive utilities/m,
      },
      {
        file: 'packages/fundamentals/hooks/src/manifest.ts',
        // Tagline line — the first occurrence in the manifest source
        pattern: /'(\d+) signal-based hooks:/,
      },
      {
        file: 'packages/fundamentals/hooks/src/manifest.ts',
        // Description line
        pattern: /Signal-based hooks for Pyreon — (\d+) reactive primitives/,
      },
      {
        file: 'CLAUDE.md',
        // Package overview table row — narrow regex to avoid colliding with
        // the architecture section's "34 signal-based hooks across 6 categories" line
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
    actual: countDocPages,
    claims: [
      {
        file: 'CLAUDE.md',
        pattern: /(\d+) doc pages covering all packages/,
      },
    ],
  },
]

// ─── Run checks ────────────────────────────────────────────────────────

interface Drift {
  check: string
  file: string
  actual: number
  claimed: number | null
  patternUsed: string
  hedgedFound?: boolean
}

const drifts: Drift[] = []

for (const check of checks) {
  const actual = check.actual()
  for (const claim of check.claims) {
    const filePath = join(REPO_ROOT, claim.file)
    if (!existsSync(filePath)) {
      drifts.push({
        check: check.name,
        file: claim.file,
        actual,
        claimed: null,
        patternUsed: claim.pattern.source,
      })
      continue
    }
    const content = readFileSync(filePath, 'utf8')

    if (claim.rejectHedged) {
      const hedged = content.match(claim.rejectHedged)
      const hedgedNum = hedged?.[1]
      if (hedgedNum) {
        drifts.push({
          check: check.name,
          file: claim.file,
          actual,
          claimed: parseInt(hedgedNum, 10),
          patternUsed: claim.rejectHedged.source,
          hedgedFound: true,
        })
        continue
      }
    }

    const match = content.match(claim.pattern)
    const claimedRaw = match?.[1]
    if (!claimedRaw) {
      drifts.push({
        check: check.name,
        file: claim.file,
        actual,
        claimed: null,
        patternUsed: claim.pattern.source,
      })
      continue
    }
    const claimed = parseInt(claimedRaw, 10)
    if (claimed !== actual) {
      drifts.push({
        check: check.name,
        file: claim.file,
        actual,
        claimed,
        patternUsed: claim.pattern.source,
      })
    }
  }
}

const json = process.argv.includes('--json')

if (json) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ drifts }, null, 2))
} else if (drifts.length === 0) {
  // eslint-disable-next-line no-console
  console.log(`✓ All doc-claim numbers match the underlying source of truth.`)
  for (const check of checks) {
    // eslint-disable-next-line no-console
    console.log(
      `  • ${check.name}: ${check.actual()} (${check.claims.length} claim site(s) checked)`,
    )
  }
} else {
  // eslint-disable-next-line no-console
  console.error(`✗ Found ${drifts.length} doc-claim drift(s):\n`)
  for (const d of drifts) {
    // eslint-disable-next-line no-console
    console.error(`  [${d.check}] ${d.file}`)
    if (d.hedgedFound) {
      // eslint-disable-next-line no-console
      console.error(
        `    rejected hedged claim "${d.claimed}+" — write the exact count instead. Actual: ${d.actual}`,
      )
    } else if (d.claimed === null) {
      // eslint-disable-next-line no-console
      console.error(
        `    pattern not found: /${d.patternUsed}/ — claim was likely deleted or rephrased. Actual: ${d.actual}`,
      )
    } else {
      // eslint-disable-next-line no-console
      console.error(`    claimed ${d.claimed}, actual ${d.actual}`)
    }
    // eslint-disable-next-line no-console
    console.error('')
  }
}

if (drifts.length > 0) {
  process.exit(1)
}
