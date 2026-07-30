// Content-addressed verdict cache for the native compile-validation harness.
//
// WHY this exists: the native suite makes ~600 `swiftc` / `kotlinc`
// invocations across 123 test files, each one a fresh process against a
// fresh temp dir. A cold JVM `kotlinc` start is 10-20s (see the note in
// this package's vitest.config.ts), so the JVM startup alone dominates the
// `Native Compiler Validation` job — which measured 35-40 minutes and became
// the last check on every PR. The recorded responses to that pain were a
// 180s per-spec `testTimeout` and a 50-minute workflow timeout: both raise
// the ceiling, neither removes the cost.
//
// WHY it is SAFE: a validate call is a PURE function of
// (kind, compiler identity, stub content, source). The compilers are
// deterministic, and the stubs are module constants. So the same key always
// implies the same verdict, and a hit can never change a result — only skip
// re-deriving one.
//
// The KEY MUST include the stub content. This is the load-bearing detail,
// not a nicety: the stubs are edited regularly (a subset stub manufactures
// failures, a superset stub MASKS real breakage — see the "stub fidelity"
// rule). A key that omitted them would serve a stale `ok` after a stub edit,
// silently defeating the exact gate this harness exists to be.
//
// The disk tier is the load-bearing one. Vitest runs this package with the
// default `forks` pool at `isolate: true`, so each test FILE gets a fresh
// module registry and an in-process Map is not shared between files. Disk is
// shared across workers AND across runs; the memo below only saves repeat
// work inside one file.

import { createHash, randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** The shape stored on disk. Deliberately NOT `ValidationResult` — a
 * `skipped` verdict depends on tool availability, which is environmental and
 * must never be cached. Only real compiler verdicts are persisted. */
interface CachedVerdict {
  ok: boolean
  error?: string
}

/** Which validator produced the verdict. Two validators can disagree about
 * the same source (`-parse` accepts what `-typecheck` rejects), so the kind
 * is part of the key rather than an afterthought. */
export type ValidateKind = 'swift-parse' | 'swift-typecheck' | 'swift-stubs' | 'kotlin'

const memo = new Map<string, CachedVerdict>()

function cacheDisabled(): boolean {
  return process.env.PYREON_VALIDATE_NO_CACHE === '1'
}

/**
 * Locate a stable cache directory. Preference order:
 *
 * 1. `PYREON_VALIDATE_CACHE_DIR` — lets CI point the cache at a path it
 *    restores between runs, and lets a test use a scratch dir.
 * 2. The nearest `node_modules/.cache/` walking up from this module. Stable
 *    across runs on one machine, conventional, and already gitignored.
 * 3. `tmpdir()`. Still de-duplicates within a run; may not survive it.
 *
 * Returns null when no directory can be created, in which case callers fall
 * back to running the compiler — a cache that cannot be written must degrade
 * to correct-but-slow, never to wrong.
 */
let _dir: string | null | undefined
export function cacheDir(): string | null {
  if (_dir !== undefined) return _dir
  _dir = null

  const candidates: string[] = []
  const override = process.env.PYREON_VALIDATE_CACHE_DIR
  if (override) candidates.push(override)

  // Walk up looking for an existing node_modules. `import.meta.url` is
  // undefined on some runtimes (workerd), so guard it rather than deref.
  const here = typeof import.meta.url === 'string' ? dirname(new URL(import.meta.url).pathname) : ''
  if (here) {
    let cur = here
    for (let i = 0; i < 8; i++) {
      const nm = join(cur, 'node_modules')
      if (existsSync(nm)) {
        candidates.push(join(nm, '.cache', 'pyreon-native-validate'))
        break
      }
      const up = resolve(cur, '..')
      if (up === cur) break
      cur = up
    }
  }

  // Last resort: the OS temp dir, which is WORLD-WRITABLE. Two hardening
  // measures, because a cache another user can write is a cache that can feed
  // this gate a forged `ok` verdict:
  //   1. The directory name carries the uid, so users cannot collide on it.
  //   2. It is created 0700, so only the owner can create entries inside it —
  //      which is what stops an attacker pre-planting a symlink at a
  //      predictable `<key>.json` path for us to read or write through.
  // The preferred `node_modules/.cache` candidate above is inside the repo and
  // not world-writable, so this only matters for the fallback.
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'nouid'
  candidates.push(join(tmpdir(), `pyreon-native-validate-cache-${uid}`))

  for (const c of candidates) {
    try {
      mkdirSync(c, { recursive: true, mode: 0o700 })
      _dir = c
      return _dir
    } catch {
      // Try the next candidate.
    }
  }
  return _dir
}

/**
 * Write a cache entry atomically and safely.
 *
 * Two properties, both load-bearing:
 *
 * - **Unpredictable temp name** (`randomBytes`, not `process.pid`): a pid is
 *   guessable, so an attacker could pre-create the temp path as a symlink and
 *   have our write land somewhere else.
 * - **`flag: 'wx'`** — exclusive create. If the path already exists (including
 *   as a symlink) the write FAILS instead of following it. This is the actual
 *   defense; the random name just makes a collision vanishingly unlikely.
 *
 * The rename is what makes it atomic: a reader, or a killed writer, can only
 * observe the absent file or the whole file — never a truncated one that
 * happens to parse as a verdict.
 */
function writeEntryAtomic(dir: string, file: string, body: string): void {
  const tmp = join(dir, `.${randomBytes(12).toString('hex')}.tmp`)
  try {
    writeFileSync(tmp, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(tmp, file)
  } catch {
    try {
      unlinkSync(tmp)
    } catch {
      // Best-effort: a failed write only costs the next process a recompute.
    }
  }
}

/** For testing: forget the resolved directory so an env change takes effect. */
export function _resetValidateCache(): void {
  memo.clear()
  _dir = undefined
}

/**
 * Build the cache key. Every input that can change the verdict is folded in:
 * the validator kind, the compiler's own version string (so a toolchain
 * upgrade invalidates wholesale), the stub source (so a stub edit
 * invalidates — the masking hazard), and the source under test.
 *
 * NUL separators, not concatenation: neither a version string nor Swift/Kotlin
 * source can contain a NUL, so no combination of fields can collide by
 * running one field's tail into the next field's head.
 */
export function cacheKey(
  kind: ValidateKind,
  compilerVersion: string,
  stubs: string,
  source: string,
): string {
  return createHash('sha256')
    .update(kind)
    .update('\0')
    .update(compilerVersion)
    .update('\0')
    .update(stubs)
    .update('\0')
    .update(source)
    .digest('hex')
}

function readDisk(key: string): CachedVerdict | undefined {
  const dir = cacheDir()
  if (dir === null) return undefined
  const file = join(dir, `${key}.json`)
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return undefined // Miss (absent, or unreadable).
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    // Validate the SHAPE before trusting it. A half-written or
    // foreign-format file must read as a miss, never as a verdict.
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as CachedVerdict).ok === 'boolean'
    ) {
      const v = parsed as CachedVerdict
      return v.error === undefined ? { ok: v.ok } : { ok: v.ok, error: v.error }
    }
  } catch {
    // Corrupt entry: drop it so it stops costing a read every call.
    try {
      unlinkSync(file)
    } catch {
      // Best-effort.
    }
  }
  return undefined
}

function writeDisk(key: string, verdict: CachedVerdict): void {
  const dir = cacheDir()
  if (dir === null) return
  writeEntryAtomic(dir, join(dir, `${key}.json`), JSON.stringify(verdict))
}

/**
 * Disk-cache a tool-availability probe, keyed on the BINARY's identity
 * (resolved path + size + mtime) rather than on its name.
 *
 * WHY: `isKotlincAvailable()` shells out to `kotlinc -version`, which starts a
 * JVM — measured at 1.36s on an M3 Max, and the package's own notes put a cold
 * CI start at 10-20s. Vitest isolates modules per test FILE, so the
 * once-per-process memo fires once per file: 123 JVM startups to answer a
 * yes/no question. Keying on size+mtime means a toolchain upgrade or a PATH
 * change re-probes, while a stable install answers from a single file read.
 *
 * Returns null on a cache miss; the caller then probes and calls
 * `writeToolProbe`.
 */
export function readToolProbe(
  bin: string,
  variant = '',
): { available: boolean; version: string } | null {
  if (cacheDisabled()) return null
  const dir = cacheDir()
  if (dir === null) return null
  const key = toolProbeKey(bin, variant)
  if (key === null) return null
  try {
    const parsed = JSON.parse(readFileSync(join(dir, `probe-${key}.json`), 'utf8')) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { available?: unknown }).available === 'boolean' &&
      typeof (parsed as { version?: unknown }).version === 'string'
    ) {
      return parsed as { available: boolean; version: string }
    }
  } catch {
    // Absent, unreadable, or corrupt: treat as a miss.
  }
  return null
}

/** Persist a tool-availability probe. Best-effort; a write failure only costs
 * the next process another probe. */
export function writeToolProbe(
  bin: string,
  value: { available: boolean; version: string },
  variant = '',
): void {
  if (cacheDisabled()) return
  const dir = cacheDir()
  if (dir === null) return
  const key = toolProbeKey(bin, variant)
  if (key === null) return
  writeEntryAtomic(dir, join(dir, `probe-${key}.json`), JSON.stringify(value))
}

/**
 * Identify a tool by the binary it resolves to, so an upgrade invalidates.
 *
 * A tool that is ABSENT resolves to no path, and "absent" must not be cached
 * against a stable key — otherwise installing the toolchain would not take
 * effect until someone cleared the cache. So a miss here (null) means the
 * caller probes every time, which is the correct behaviour for the
 * not-installed case and costs nothing once it IS installed.
 */
function toolProbeKey(bin: string, variant = ''): string | null {
  const resolved = whichSync(bin)
  if (resolved === null) return null
  try {
    const st = statSync(resolved)
    return createHash('sha256')
      .update(resolved)
      .update('\0')
      .update(String(st.size))
      .update('\0')
      .update(String(st.mtimeMs))
      .update('\0')
      .update(variant)
      .digest('hex')
      .slice(0, 32)
  } catch {
    return null
  }
}

/** Resolve a bare command against PATH without spawning anything. */
function whichSync(bin: string): string | null {
  const path = process.env.PATH
  if (path === undefined || path === '') return null
  for (const part of path.split(':')) {
    if (part === '') continue
    const candidate = join(part, bin)
    try {
      const st = statSync(candidate)
      // Any executable bit is enough; we only need a stable identity.
      if (st.isFile() && (st.mode & 0o111) !== 0) return candidate
    } catch {
      // Not here.
    }
  }
  return null
}

/**
 * Run `compute` unless a cached verdict for this exact input already exists.
 *
 * `skipped` verdicts are passed through UNCACHED: they encode tool
 * availability rather than a compiler judgement, and they are already free.
 */
export function withVerdictCache(
  kind: ValidateKind,
  compilerVersion: string,
  stubs: string,
  source: string,
  compute: () => { ok: boolean; error?: string; skipped?: boolean; skipReason?: string },
): { ok: boolean; error?: string; skipped?: boolean; skipReason?: string } {
  if (cacheDisabled()) return compute()

  const key = cacheKey(kind, compilerVersion, stubs, source)

  const hit = memo.get(key) ?? readDisk(key)
  if (hit !== undefined) {
    memo.set(key, hit)
    return hit.error === undefined ? { ok: hit.ok } : { ok: hit.ok, error: hit.error }
  }

  const result = compute()
  if (result.skipped === true) return result

  const verdict: CachedVerdict =
    result.error === undefined ? { ok: result.ok } : { ok: result.ok, error: result.error }
  memo.set(key, verdict)
  writeDisk(key, verdict)
  return result
}
