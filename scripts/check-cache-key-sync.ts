// A cache SAVE key and its RESTORE key must hash the same inputs.
//
// ## Why this gate exists
//
// `hashFiles(...)` is a pure function of its argument list. Two call sites that
// hash DIFFERENT patterns produce different digests, so a restore key built
// from one list can never match an entry saved under the other. There is no
// error, no warning, and no red check — every restore simply misses and the
// fallback rebuild runs.
//
// That is what happened here. The save (ci.yml) hashed six patterns:
//
//   src/** + package.json + packages tsconfig.json + root tsconfig.json
//   + scripts/bootstrap.ts + bun.lock
//
// and the restore (setup-pyreon) hashed four — both tsconfig patterns were
// missing. Measured consequence on run 30840261671: FORTY-THREE jobs each
// rebuilt all 74 packages, ~350s apiece, in a tight 347-363s band. Not
// intermittent — a 100% miss rate by construction. That was **228 of the run's
// 401 runner-minutes**, i.e. 57% of all CI compute, spent rebuilding artifacts
// that had been built and cached minutes earlier in the same run.
//
// The existing protection was a comment reading "Key MUST match the restore
// step above — keep in sync." Comments do not diff. This does.
//
// ## What it checks
//
// Every `hashFiles(...)` argument list attached to a key with the same cache
// PREFIX (`bootstrap-ubuntu-`, etc.) must be byte-identical across all
// workflow files and composite actions. Prefixes with only one call site are
// reported as coverage info, never failed — a single site cannot drift.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

export interface KeyUse {
  file: string
  prefix: string
  args: string
  line: number
}

/**
 * Find every `<prefix>-${{ hashFiles(...) }}` occurrence.
 *
 * The prefix is the literal text between the last newline/whitespace boundary
 * and the `${{`, minus a trailing dash — e.g. `bootstrap-ubuntu-`. The args are
 * the raw text inside `hashFiles(...)`, compared verbatim: whitespace or order
 * differences change the digest too, so a "cosmetic" difference is a real one.
 * Pure — unit-tested.
 */
export function extractKeyUses(text: string, file: string): KeyUse[] {
  const out: KeyUse[] = []
  const lines = text.split('\n')
  const re = /([A-Za-z0-9_.-]+-)\$\{\{\s*hashFiles\(([^)]*)\)\s*\}\}/g
  lines.forEach((line, i) => {
    for (const m of line.matchAll(re)) {
      out.push({ file, prefix: m[1]!, args: m[2]!.trim(), line: i + 1 })
    }
  })
  return out
}

export interface Drift {
  prefix: string
  variants: Array<{ args: string; sites: string[] }>
}

/**
 * Group by cache prefix; a prefix used with more than one distinct argument
 * list is drift. Pure — unit-tested.
 */
export function findKeyDrift(uses: KeyUse[]): Drift[] {
  const byPrefix = new Map<string, KeyUse[]>()
  for (const u of uses) {
    const list = byPrefix.get(u.prefix)
    if (list) list.push(u)
    else byPrefix.set(u.prefix, [u])
  }

  const drifts: Drift[] = []
  for (const [prefix, list] of byPrefix) {
    const byArgs = new Map<string, string[]>()
    for (const u of list) {
      const sites = byArgs.get(u.args)
      const site = `${u.file}:${u.line}`
      if (sites) sites.push(site)
      else byArgs.set(u.args, [site])
    }
    if (byArgs.size > 1) {
      drifts.push({
        prefix,
        variants: [...byArgs.entries()]
          .map(([args, sites]) => ({ args, sites }))
          .sort((a, b) => a.args.localeCompare(b.args)),
      })
    }
  }
  return drifts.sort((a, b) => a.prefix.localeCompare(b.prefix))
}

// ─── main ─────────────────────────────────────────────────────────────────

function collectYaml(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) collectYaml(p, acc)
    else if (/\.ya?ml$/.test(entry)) acc.push(p)
  }
  return acc
}

const files = collectYaml(join(REPO, '.github'))
const uses = files.flatMap((f) => extractKeyUses(readFileSync(f, 'utf8'), f.slice(REPO.length + 1)))

if (uses.length === 0) {
  console.error('[check-cache-key-sync] FAILED — found ZERO hashFiles cache keys; the scan is broken')
  process.exit(1)
}

const drifts = findKeyDrift(uses)
if (drifts.length > 0) {
  console.error(
    `[check-cache-key-sync] FAILED — ${drifts.length} cache prefix(es) hash DIFFERENT inputs at different sites:`,
  )
  for (const d of drifts) {
    console.error(`\n  ${d.prefix}`)
    for (const v of d.variants) {
      console.error(`    hashFiles(${v.args})`)
      for (const s of v.sites) console.error(`      at ${s}`)
    }
  }
  console.error(
    `\nhashFiles() is a pure function of its argument list, so two different lists
produce two different digests and the restore can NEVER match the save. There is
no error and no red check — every restore just misses and the fallback rebuild
runs. This exact drift cost 228 of one run's 401 runner-minutes.

Make the argument lists byte-identical.`,
  )
  process.exit(1)
}

const prefixes = new Set(uses.map((u) => u.prefix))
console.log(
  `[check-cache-key-sync] ✓ ${uses.length} cache key(s) across ${prefixes.size} prefix(es) hash consistent inputs`,
)
