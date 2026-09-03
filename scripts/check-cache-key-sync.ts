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

// ─── one artifact ⇒ one key prefix ⇒ one writer ───────────────────────────
//
// The drift check above catches one PREFIX hashing two input lists. It cannot
// see the inverse: one PATH cached under two prefixes by two workflows. That is
// what filled the 10 GB actions cache three times — `~/.bun/install/cache`
// saved by ci.yml as `bun-install-cache-*` AND by release.yml +
// bundle-size-diff.yml as `bun-*`, one artifact stored once per lockfile
// variant per prefix (4.8 GB of pure duplication, 2026-09-01), and LRU then
// evicting the small entries every PR depends on. A restore-only site under a
// second prefix is a different, quieter hole: it can never hit, because nothing
// ever saves that prefix.

export interface CacheStep {
  file: string
  line: number
  /** `save` = actions/cache/save, `restore` = actions/cache/restore, `both` = actions/cache */
  kind: 'save' | 'restore' | 'both'
  /** Normalized, sorted path list — the artifact identity. */
  paths: string[]
  /** The literal text before the first `${{` in `key:` — '' when the key is pure expression. */
  prefix: string
}

/**
 * Find every `actions/cache*` step and read its `path:` (scalar or block) and
 * `key:`. Indentation-driven: a step ends at the next `- ` at the same indent.
 * Pure — unit-tested.
 */
export function extractCacheSteps(text: string, file: string): CacheStep[] {
  const lines = text.split('\n')
  const out: CacheStep[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-?\s*uses:\s*actions\/cache(\/save|\/restore)?@/.exec(lines[i]!)
    if (!m) continue
    const kind: CacheStep['kind'] = m[2] === '/save' ? 'save' : m[2] === '/restore' ? 'restore' : 'both'
    // The step's own indent is that of its `- ` line; `uses:` may sit on the
    // `- ` line or on the following line (when `- name:` came first).
    const stepIndent = lines[i]!.startsWith(`${m[1]}-`)
      ? m[1]!.length
      : findStepIndent(lines, i)
    const paths: string[] = []
    let prefix = ''
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!
      const indent = l.length - l.trimStart().length
      if (l.trim() !== '' && !l.trim().startsWith('#') && indent <= stepIndent) break
      const pm = /^\s*path:\s*(.*)$/.exec(l)
      if (pm) {
        if (pm[1]!.trim() === '|' || pm[1]!.trim() === '') {
          for (let k = j + 1; k < lines.length; k++) {
            const pl = lines[k]!
            const pind = pl.length - pl.trimStart().length
            if (pl.trim() === '' || pind <= indent) break
            paths.push(pl.trim())
          }
        } else paths.push(pm[1]!.trim())
      }
      const km = /^\s*key:\s*(.*)$/.exec(l)
      if (km) prefix = km[1]!.split('${{')[0]!.trim()
    }
    out.push({ file, line: i + 1, kind, paths: [...paths].sort(), prefix })
  }
  return out
}

function findStepIndent(lines: string[], from: number): number {
  for (let j = from - 1; j >= 0; j--) {
    const l = lines[j]!
    if (/^\s*-\s/.test(l)) return l.length - l.trimStart().length
  }
  return 0
}

export interface PathDuplicate {
  paths: string[]
  writers: Array<{ prefix: string; sites: string[] }>
}

/** One artifact path written under >1 key prefix — every extra prefix is a second copy. */
export function findDuplicateWriters(steps: CacheStep[]): PathDuplicate[] {
  const byPath = new Map<string, Map<string, string[]>>()
  for (const s of steps) {
    if (s.kind === 'restore' || s.prefix === '') continue
    const id = s.paths.join('\n')
    const writers = byPath.get(id) ?? new Map<string, string[]>()
    byPath.set(id, writers)
    const sites = writers.get(s.prefix) ?? []
    sites.push(`${s.file}:${s.line}`)
    writers.set(s.prefix, sites)
  }
  const out: PathDuplicate[] = []
  for (const [id, writers] of byPath) {
    if (writers.size < 2) continue
    out.push({
      paths: id.split('\n'),
      writers: [...writers.entries()]
        .map(([prefix, sites]) => ({ prefix, sites }))
        .sort((a, b) => a.prefix.localeCompare(b.prefix)),
    })
  }
  return out.sort((a, b) => a.paths[0]!.localeCompare(b.paths[0]!))
}

export interface OrphanRestore {
  prefix: string
  sites: string[]
}

/** A restore-only site under a prefix NO writer saves can never hit. */
export function findOrphanRestores(steps: CacheStep[]): OrphanRestore[] {
  const written = new Set(steps.filter((s) => s.kind !== 'restore' && s.prefix !== '').map((s) => s.prefix))
  const byPrefix = new Map<string, string[]>()
  for (const s of steps) {
    if (s.kind !== 'restore' || s.prefix === '' || written.has(s.prefix)) continue
    const sites = byPrefix.get(s.prefix) ?? []
    sites.push(`${s.file}:${s.line}`)
    byPrefix.set(s.prefix, sites)
  }
  return [...byPrefix.entries()]
    .map(([prefix, sites]) => ({ prefix, sites }))
    .sort((a, b) => a.prefix.localeCompare(b.prefix))
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

const steps = files.flatMap((f) => extractCacheSteps(readFileSync(f, 'utf8'), f.slice(REPO.length + 1)))
if (steps.length === 0) {
  console.error('[check-cache-key-sync] FAILED — found ZERO actions/cache steps; the scan is broken')
  process.exit(1)
}

const dups = findDuplicateWriters(steps)
if (dups.length > 0) {
  console.error(
    `[check-cache-key-sync] FAILED — ${dups.length} cache path(s) are WRITTEN under more than one key prefix:`,
  )
  for (const d of dups) {
    console.error(`\n  ${d.paths.join(' + ')}`)
    for (const w of d.writers) {
      console.error(`    ${w.prefix}`)
      for (const s of w.sites) console.error(`      at ${s}`)
    }
  }
  console.error(
    `\nOne artifact ⇒ one key prefix ⇒ one writer. A second prefix stores a second
copy of the same bytes per variant — 4.8 GB of the 10 GB budget on 2026-09-01 —
and LRU then evicts the small entries every PR depends on. Keep ONE writer
(ci.yml's Install job for the shared stores) and make every other site an
\`actions/cache/restore\` under that exact prefix.`,
  )
  process.exit(1)
}

const orphans = findOrphanRestores(steps)
if (orphans.length > 0) {
  console.error(
    `[check-cache-key-sync] FAILED — ${orphans.length} restore-only prefix(es) that NO step ever saves (they can never hit):`,
  )
  for (const o of orphans) {
    console.error(`\n  ${o.prefix}`)
    for (const s of o.sites) console.error(`      at ${s}`)
  }
  process.exit(1)
}

const prefixes = new Set(uses.map((u) => u.prefix))
const written = new Set(steps.filter((s) => s.kind !== 'restore' && s.prefix !== '').map((s) => s.prefix))
console.log(
  `[check-cache-key-sync] ✓ ${uses.length} cache key(s) across ${prefixes.size} prefix(es) hash consistent inputs; ${steps.length} cache step(s), ${written.size} written prefix(es), one writer per path`,
)
