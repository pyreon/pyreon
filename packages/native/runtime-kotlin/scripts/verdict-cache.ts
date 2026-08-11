/**
 * Content-addressed verdict cache for the Kotlin runtime's service verification.
 *
 * ## Why
 *
 * `verify-all.ts` spawns a fresh `kotlinc` per service — 45 of them, and a cold
 * JVM start dominates each one. That runs THREE times per CI run (the typecheck
 * cell, the test cell, and `Release Build`'s clean build), and `Release Build`
 * pays it on EVERY code PR, including the overwhelming majority that never touch
 * a `.kt` file.
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
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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

export function writeVerdict(key: string, verdict: Verdict): void {
  const dir = cacheDir()
  if (dir === null || cacheDisabled()) return
  // Write-then-rename: a reader must never observe a partial file, and several
  // services finish concurrently.
  const tmp = join(dir, `${key}.${process.pid}.tmp`)
  try {
    writeFileSync(tmp, JSON.stringify(verdict))
    renameSync(tmp, join(dir, `${key}.json`))
  } catch {
    // Best effort — a cache that cannot be written is not a build failure.
  }
}
