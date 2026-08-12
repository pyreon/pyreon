/**
 * Content-addressed verdict cache for the Kotlin runtime's service verification.
 *
 * ## Why
 *
 * `verify-all.ts` spawns a fresh `kotlinc` per service — 46 of them, and a cold
 * JVM start dominates each one. That runs TWICE per CI run: the test cell and
 * `Release Build`'s clean build. (The typecheck script deliberately skips in CI
 * — kotlinc cold-start under parallel load — so it is not a third.) Both are
 * full mode, so they share cache keys; and `Release Build` pays it on EVERY code
 * PR, including the overwhelming majority that never touch a `.kt` file.
 *
 * A verification is a pure function of (compiler, harness, source, mode), so the
 * same inputs always imply the same verdict. A hit can never change a result —
 * only skip re-deriving one.
 *
 * Same design as `@pyreon/native-compiler`'s `validate-cache.ts`, which
 * documents the reasoning at length. Reimplemented here rather than imported
 * because that module is not exported from its package, and a workspace edge
 * from a Kotlin-source package to a JS compiler package to reach ~100 lines is
 * a worse trade than the duplication.
 *
 * ## What is in the key, and why each part
 *
 * - **kotlinc version** — a compiler upgrade can legitimately change a verdict;
 *   that is the whole reason the nightly runs uncached.
 * - **`verify-kotlin.ts`'s own bytes** — the stubs live inside it. Keying on
 *   stub content is the load-bearing detail its sibling calls out: a subset stub
 *   manufactures failures and a superset stub MASKS real breakage, so a key that
 *   ignored them would serve a stale `ok` after a stub edit and silently defeat
 *   the gate. Hashing the whole file over-invalidates (a comment edit busts every
 *   entry) and that is the correct direction to be wrong in.
 * - **the service source AND its test file** — the actual subject.
 * - **the MODE** — `--typecheck-only` is strictly weaker than a full
 *   build-and-run. Without mode in the key, a typecheck-only `ok` would be
 *   served to a full run and a broken smoke `main()` would never be caught. This
 *   is the one mistake that would turn a speedup into a hole.
 *
 * ## What is NOT cached
 *
 * Only real verdicts. A "kotlinc is not installed" skip is environmental, so
 * caching it would carry one machine's missing toolchain to another.
 *
 * `PYREON_VALIDATE_NO_CACHE=1` bypasses; `PYREON_VALIDATE_CACHE_DIR` relocates —
 * the same two knobs the sibling uses, so CI wiring is shared rather than
 * reinvented.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface Verdict {
  ok: boolean
}

export function cacheDisabled(): boolean {
  return process.env.PYREON_VALIDATE_NO_CACHE === '1'
}

/** Where verdicts live, or null when the directory cannot be created. */
export function cacheDir(): string | null {
  const base = process.env.PYREON_VALIDATE_CACHE_DIR ?? join(tmpdir(), 'pyreon-native-validate')
  const dir = join(base, 'kotlin-runtime')
  try {
    mkdirSync(dir, { recursive: true })
    return dir
  } catch {
    // No cache directory is a degraded mode, never a failure: verification
    // still runs, it just re-derives every verdict.
    return null
  }
}

/** The key. Pure — unit-tested, including that MODE changes it. */
export function verdictKey(inputs: {
  compilerVersion: string
  harness: string
  source: string
  test: string
  typecheckOnly: boolean
}): string {
  return createHash('sha256')
    .update('kotlin-runtime-service\0')
    .update(inputs.compilerVersion)
    .update('\0')
    .update(inputs.harness)
    .update('\0')
    .update(inputs.source)
    .update('\0')
    .update(inputs.test)
    .update('\0')
    .update(inputs.typecheckOnly ? 'typecheck' : 'full')
    .digest('hex')
}

export function readVerdict(key: string): Verdict | undefined {
  const dir = cacheDir()
  if (dir === null || cacheDisabled()) return undefined
  try {
    const parsed = JSON.parse(readFileSync(join(dir, `${key}.json`), 'utf8')) as unknown
    // Validate the SHAPE before trusting it — a half-written or hand-edited
    // file must read as a miss, not as a verdict.
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as Verdict).ok === 'boolean') {
      return { ok: (parsed as Verdict).ok }
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Write a verdict atomically and safely.
 *
 * Three properties, all load-bearing, and all lifted verbatim from
 * `@pyreon/native-compiler`'s `validate-cache.ts`:
 *
 * - **Unpredictable temp name** (`randomBytes`, not `process.pid`): a pid is
 *   guessable, so an attacker could pre-create the temp path as a symlink and
 *   have this write land somewhere else. The cache lives under the OS temp dir,
 *   which is world-writable.
 * - **`flag: 'wx'`** — exclusive create. If the path already exists (including
 *   as a symlink) the write FAILS rather than following it. This is the actual
 *   defense; the random name only makes a collision vanishingly unlikely.
 * - **`mode: 0o600`** — the verdict is ours to read.
 *
 * The rename is what makes it atomic: a reader, or a killed writer, can only
 * observe the absent file or the whole file — never a truncated one that
 * happens to parse as a verdict. Several services finish concurrently, so that
 * matters here.
 *
 * The first version of this function used `process.pid` and no `wx`, which is
 * precisely the mistake the sibling's comment warns about — CodeQL flagged it
 * as `js/insecure-temporary-file`. Worth recording, because it is the cost of
 * the reimplement-rather-than-import decision at the top of this file showing up
 * within the hour: copying the design while leaving behind the hard-won details
 * is exactly how a "same design as X" comment becomes false.
 */
export function writeVerdict(key: string, verdict: Verdict): void {
  const dir = cacheDir()
  if (dir === null || cacheDisabled()) return
  const tmp = join(dir, `.${randomBytes(12).toString('hex')}.tmp`)
  try {
    writeFileSync(tmp, JSON.stringify(verdict), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(tmp, join(dir, `${key}.json`))
  } catch {
    try {
      unlinkSync(tmp)
    } catch {
      // Best effort — a failed write only costs the next process a recompute.
    }
  }
}
