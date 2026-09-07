#!/usr/bin/env bun
/**
 * Prune SUPERSEDED Actions cache entries on main so the 10 GB budget stays
 * far from the eviction cliff.
 *
 * ## Why
 *
 * Every lockfile change on main mints a fresh copy of the bun tarball store
 * (~2 GB), node_modules (~0.4 GB) and the Playwright Chromium download
 * (~0.3 GB) under a new content hash. The previous copies are never read
 * again (each restore takes the newest key under its prefix) but stay until
 * GitHub's 7-day LRU evicts them. Measured 2026-09-07: three tarball-store
 * generations = 6 GB of a 9.9 GB total. At capacity GitHub evicts the
 * SMALLEST, least-recently-used entries first — which is the native
 * compile-verdict store, whose loss turns a 1-minute native test cell into a
 * 25-minute timeout-cancel (see .claude/rules/workflow.md, the
 * native-compiler cap entry). Keeping the budget clear is what keeps that
 * store warm.
 *
 * ## What it deletes — and only that
 *
 * On `refs/heads/main` ONLY (PR refs are wiped on close by cache-cleanup.yml),
 * for the content-hashed families listed in `FAMILIES`: every entry except
 * the NEWEST per lineage. A lineage is the key with its trailing content hash
 * removed, so `bun-install-cache-Linux-<hash>` and
 * `bun-install-cache-macOS-<hash>` are pruned independently.
 *
 * Fail-safe direction: this DELETES, so every uncertainty resolves to
 * "delete nothing" — an empty or failed listing aborts non-zero, an entry
 * younger than `GRACE_MS` is never touched (a run that just saved it may
 * still be fanning out), and the newest of a lineage is always kept even if
 * it is the only one. Dry-run by default; `--apply` deletes.
 */

import { execFileSync } from 'node:child_process'

export interface CacheEntry {
  id: number
  key: string
  ref: string
  createdAt: string
  sizeInBytes: number
}

/** Key prefixes whose entries are content-hashed generations of ONE artifact. */
export const FAMILIES: readonly string[] = [
  'bun-install-cache-',
  'node-modules-',
  'playwright-chromium-',
  'bootstrap-ubuntu-',
  'cargo-registry-',
  'cargo-target-',
]

export const MAIN_REF = 'refs/heads/main'
/** Never delete an entry this young — the run that saved it may still be restoring it. */
export const GRACE_MS = 30 * 60 * 1000

const TRAILING_HASH = /-[0-9a-f]{32,64}$/

/** The key with its content hash removed — what makes two entries generations of one artifact. */
export function lineageOf(key: string): string | null {
  if (!FAMILIES.some((f) => key.startsWith(f))) return null
  if (!TRAILING_HASH.test(key)) return null
  return key.replace(TRAILING_HASH, '')
}

export interface Selection {
  keep: CacheEntry[]
  del: CacheEntry[]
}

export function selectSuperseded(entries: readonly CacheEntry[], now = Date.now()): Selection {
  const byLineage = new Map<string, CacheEntry[]>()
  const keep: CacheEntry[] = []
  for (const e of entries) {
    const lineage = e.ref === MAIN_REF ? lineageOf(e.key) : null
    if (lineage === null) {
      keep.push(e)
      continue
    }
    const arr = byLineage.get(lineage) ?? []
    arr.push(e)
    byLineage.set(lineage, arr)
  }
  const del: CacheEntry[] = []
  for (const arr of byLineage.values()) {
    arr.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    keep.push(arr[0]!)
    for (const e of arr.slice(1)) {
      if (now - Date.parse(e.createdAt) < GRACE_MS) keep.push(e)
      else del.push(e)
    }
  }
  return { keep, del }
}

export function summarize(sel: Selection): string {
  const gb = (n: number) => (n / 1e9).toFixed(2) + ' GB'
  const total = sel.del.reduce((a, e) => a + e.sizeInBytes, 0)
  const lines = sel.del.map(
    (e) => '  delete ' + gb(e.sizeInBytes).padStart(8) + '  ' + e.key + '  (' + e.createdAt + ')',
  )
  lines.push(
    sel.del.length +
      ' superseded entr' +
      (sel.del.length === 1 ? 'y' : 'ies') +
      ', ' +
      gb(total) +
      ' reclaimable; ' +
      sel.keep.length +
      ' kept',
  )
  return lines.join('\n')
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

if (import.meta.main) {
  const apply = process.argv.includes('--apply')
  const repo = process.env.GITHUB_REPOSITORY ?? 'pyreon/pyreon'
  const raw = gh([
    'cache',
    'list',
    '--repo',
    repo,
    '--ref',
    MAIN_REF,
    '--limit',
    '1000',
    '--json',
    'id,key,ref,createdAt,sizeInBytes',
  ])
  const entries = JSON.parse(raw) as CacheEntry[]
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error(
      '[prune-superseded-caches] empty or unreadable cache listing — refusing to delete anything',
    )
    process.exit(1)
  }
  const sel = selectSuperseded(entries)
  console.log(summarize(sel))
  if (!apply) {
    console.log('(dry run — pass --apply to delete)')
    process.exit(0)
  }
  for (const e of sel.del) {
    try {
      gh(['cache', 'delete', String(e.id), '--repo', repo])
    } catch {
      console.warn('  could not delete ' + e.key + ' (already evicted?) — continuing')
    }
  }
}
