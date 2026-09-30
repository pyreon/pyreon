/**
 * Content hashing + staleness policy for `scripts/bootstrap.ts`.
 *
 * Split out as pure-ish functions (filesystem in, digest out — no process
 * state, no spawning) so the staleness decision is unit-testable without
 * running a real build. See `packages/internals/test-utils/src/tests/
 * bootstrap-hash.test.ts`.
 *
 * ## The two-sided manifest
 *
 * Each manifest entry records BOTH halves of "what the last bootstrap build
 * produced":
 *
 *   - `src` — the source-content hash the lib was built FROM
 *   - `lib` — the content hash of the lib/ that build WROTE
 *
 * A package is fresh only when both still match. Recording `src` alone (the
 * original scheme) answers "did the source change since bootstrap last
 * built it?", which is not the question — the question is "does lib/ reflect
 * the current source?". The two diverge whenever lib/ is rewritten by
 * anything other than bootstrap: a manual `bun run --filter=<pkg> build`
 * (the documented dev-server bisect recipe does exactly this), a build run
 * from a different checkout of the source. Then returning the source to the
 * content bootstrap last recorded — `git checkout` back, a merge that lands
 * on the same bytes — matches the manifest and skips the package while lib/
 * holds the OTHER build. Silent stale lib, which is the failure bootstrap
 * exists to prevent. Hashing lib/ closes it by construction: any out-of-band
 * write changes the lib hash.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Bump when the hashing scheme changes, to invalidate every stale manifest. */
export const HASH_SCHEME_VERSION = 'v2'

export interface ManifestEntry {
  /** Source-content hash the recorded build was made from. */
  src: string
  /** Content hash of the lib/ that build produced ('' for non-lib packages). */
  lib: string
}

export type Manifest = Record<string, ManifestEntry>

/** Tests/fixtures/generated/dotfiles don't affect a package's built output. */
export function shouldSkipForHash(name: string): boolean {
  return (
    name.startsWith('.') ||
    name === 'node_modules' ||
    name === 'lib' ||
    name === '__tests__' ||
    name === 'tests' ||
    name === '__snapshots__' ||
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.test.js')
  )
}

/** Collect `[relativePath, content]` for every file under `dir` accepted by `accept`. Sorted. */
function collectFiles(
  base: string,
  dir: string,
  accept: (name: string, isDir: boolean) => boolean,
): Array<[string, Buffer]> {
  const files: Array<[string, Buffer]> = []
  const stack: string[] = existsSync(dir) ? [dir] : []
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const isDir = entry.isDirectory()
      if (!accept(entry.name, isDir)) continue
      const full = join(current, entry.name)
      if (isDir) {
        stack.push(full)
      } else if (entry.isFile()) {
        try {
          files.push([relative(base, full), readFileSync(full)])
        } catch {
          // Unreadable — contributes a sentinel so the hash differs, forcing
          // a rebuild (fail-safe toward rebuilding, never toward skipping).
          files.push([relative(base, full), Buffer.from('<unreadable>')])
        }
      }
    }
  }
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return files
}

function updateWithFiles(h: ReturnType<typeof createHash>, files: Array<[string, Buffer]>): void {
  for (const [rel, content] of files) {
    h.update(rel)
    h.update('\0')
    h.update(content)
    h.update('\0')
  }
}

/**
 * Global salt: invalidates ALL package hashes on a shared dep / tooling /
 * TS-config change. `bun.lock` carries third-party versions (some are BUNDLED
 * into lib) and the build-tool version; the root tsconfig shapes every
 * package's compiler options.
 */
export function computeGlobalSalt(root: string): string {
  const h = createHash('sha1').update(HASH_SCHEME_VERSION)
  for (const shared of ['bun.lock', 'tsconfig.json']) {
    try {
      h.update(readFileSync(join(root, shared)))
    } catch {
      // Missing (unexpected) — salt still varies by scheme version + the rest.
    }
  }
  return h.digest('hex')
}

/**
 * Content hash of a package's build INPUTS: its src/** file contents +
 * package.json + tsconfig.json + the global salt. Deterministic.
 */
export function computePkgHash(pkgPath: string, salt: string): string {
  const h = createHash('sha1').update(salt)
  updateWithFiles(
    h,
    collectFiles(pkgPath, join(pkgPath, 'src'), (name) => !shouldSkipForHash(name)),
  )
  for (const cfg of ['package.json', 'tsconfig.json']) {
    try {
      h.update(readFileSync(join(pkgPath, cfg)))
    } catch {
      // tsconfig.json is optional — its absence contributes nothing.
    }
  }
  return h.digest('hex')
}

/**
 * Content hash of a package's build OUTPUT (lib/**). Source maps are skipped:
 * they are derived from the same build as the `.js` beside them, so any
 * rebuild that changes a map also changes its `.js`, and skipping them roughly
 * halves the bytes hashed. Returns '' when there is no lib/.
 */
export function computeLibHash(pkgPath: string): string {
  const libDir = join(pkgPath, 'lib')
  if (!existsSync(libDir)) return ''
  const h = createHash('sha1')
  updateWithFiles(
    h,
    collectFiles(libDir, libDir, (name, isDir) => isDir || !name.endsWith('.map')),
  )
  return h.digest('hex')
}

export type StaleReason = 'source-changed' | 'lib-changed' | null

/**
 * Decide whether a package's lib/ must be rebuilt.
 *
 * - no entry (first run / never built / pre-v2 manifest) → 'source-changed'
 * - source hash differs from the recorded build input → 'source-changed'
 * - lib hash differs from what that build wrote → 'lib-changed' (lib/ was
 *   rewritten out-of-band, so it no longer provably reflects `src`)
 * - both match → null (fresh)
 */
export function staleReason(
  entry: ManifestEntry | undefined,
  srcHash: string,
  libHash: string,
): StaleReason {
  if (!entry || entry.src !== srcHash) return 'source-changed'
  if (entry.lib !== libHash) return 'lib-changed'
  return null
}

/**
 * Parse a manifest file's JSON. Tolerant: any entry that is not a
 * `{ src, lib }` pair of strings (a v1 manifest stored a bare string) is
 * dropped, which makes that package stale — a one-time rebuild, never a skip.
 */
export function parseManifest(json: string): Manifest {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return {}
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Manifest = {}
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as ManifestEntry).src === 'string' &&
      typeof (value as ManifestEntry).lib === 'string'
    ) {
      out[name] = { src: (value as ManifestEntry).src, lib: (value as ManifestEntry).lib }
    }
  }
  return out
}

/** Serialize with sorted keys for stable diffs / deterministic content. */
export function serializeManifest(manifest: Manifest): string {
  const sorted: Manifest = {}
  for (const k of Object.keys(manifest).sort()) sorted[k] = manifest[k] as ManifestEntry
  return `${JSON.stringify(sorted, null, 2)}\n`
}
