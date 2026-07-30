// Contract tests for the native compile-validation verdict cache.
//
// The cache's whole justification is that a validate call is a PURE function of
// (kind, compiler identity, stub content, source). Every test here pins one of
// those four to the key. The stub-content test is the load-bearing one: the
// stubs are edited regularly, and a key that omitted them would serve a stale
// `ok` after an edit — silently defeating the gate the harness exists to be.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetValidateCache,
  cacheKey,
  readToolProbe,
  withVerdictCache,
  writeToolProbe,
} from '../validate-cache'

let dir: string
const prevDir = process.env.PYREON_VALIDATE_CACHE_DIR
const prevOff = process.env.PYREON_VALIDATE_NO_CACHE

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pyreon-vcache-test-'))
  process.env.PYREON_VALIDATE_CACHE_DIR = dir
  delete process.env.PYREON_VALIDATE_NO_CACHE
  _resetValidateCache()
})

afterEach(() => {
  _resetValidateCache()
  if (prevDir === undefined) delete process.env.PYREON_VALIDATE_CACHE_DIR
  else process.env.PYREON_VALIDATE_CACHE_DIR = prevDir
  if (prevOff === undefined) delete process.env.PYREON_VALIDATE_NO_CACHE
  else process.env.PYREON_VALIDATE_NO_CACHE = prevOff
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('cacheKey — every verdict-affecting input is folded in', () => {
  it('CHANGES when the stub content changes (the masking hazard)', () => {
    // If this ever collapses to a single key, a stub edit would serve the
    // pre-edit verdict: a superset stub would keep reporting `ok` for an emit
    // that no longer compiles against the real framework.
    const a = cacheKey('kotlin', 'v1', 'STUBS-A', 'src')
    const b = cacheKey('kotlin', 'v1', 'STUBS-B', 'src')
    expect(a).not.toBe(b)
  })

  it('CHANGES when the compiler version changes', () => {
    expect(cacheKey('kotlin', 'v1', 's', 'src')).not.toBe(cacheKey('kotlin', 'v2', 's', 'src'))
  })

  it('CHANGES when the validator KIND changes', () => {
    // `-parse` accepts sources `-typecheck` rejects, so the two must not share
    // a verdict for identical text.
    expect(cacheKey('swift-parse', 'v', 's', 'src')).not.toBe(
      cacheKey('swift-typecheck', 'v', 's', 'src'),
    )
  })

  it('CHANGES when the source changes', () => {
    expect(cacheKey('kotlin', 'v', 's', 'a')).not.toBe(cacheKey('kotlin', 'v', 's', 'b'))
  })

  it('is STABLE for identical inputs (otherwise nothing would ever hit)', () => {
    expect(cacheKey('kotlin', 'v', 's', 'src')).toBe(cacheKey('kotlin', 'v', 's', 'src'))
  })

  it('cannot be collided by running one field into the next', () => {
    // NUL-separated, so ('ab','c') and ('a','bc') stay distinct.
    expect(cacheKey('kotlin', 'ab', 'c', 'src')).not.toBe(cacheKey('kotlin', 'a', 'bc', 'src'))
  })
})

describe('withVerdictCache', () => {
  it('computes on a miss and reuses on a hit', () => {
    let calls = 0
    const run = (): { ok: boolean } => {
      calls++
      return { ok: true }
    }
    expect(withVerdictCache('kotlin', 'v', 's', 'src', run).ok).toBe(true)
    expect(withVerdictCache('kotlin', 'v', 's', 'src', run).ok).toBe(true)
    expect(calls).toBe(1)
  })

  it('preserves the compiler ERROR TEXT across a hit', () => {
    // A cached failure must stay diagnosable — an `ok:false` with the error
    // dropped would turn a useful gate failure into a mystery.
    let calls = 0
    const run = (): { ok: boolean; error: string } => {
      calls++
      return { ok: false, error: "error: cannot find 'Switch' in scope" }
    }
    withVerdictCache('kotlin', 'v', 's', 'src', run)
    const second = withVerdictCache('kotlin', 'v', 's', 'src', run)
    expect(calls).toBe(1)
    expect(second.ok).toBe(false)
    expect(second.error).toBe("error: cannot find 'Switch' in scope")
  })

  it('re-computes after the stub content changes', () => {
    let calls = 0
    const run = (): { ok: boolean } => {
      calls++
      return { ok: true }
    }
    withVerdictCache('kotlin', 'v', 'STUBS-A', 'src', run)
    withVerdictCache('kotlin', 'v', 'STUBS-B', 'src', run)
    expect(calls).toBe(2)
  })

  it('does NOT cache a `skipped` verdict', () => {
    // Skips encode tool availability, not a compiler judgement. Caching one
    // would make an installed toolchain look absent for the cache's lifetime.
    let calls = 0
    const run = (): { ok: boolean; skipped: boolean; skipReason: string } => {
      calls++
      return { ok: true, skipped: true, skipReason: 'kotlinc not on PATH' }
    }
    withVerdictCache('kotlin', 'v', 's', 'src', run)
    withVerdictCache('kotlin', 'v', 's', 'src', run)
    expect(calls).toBe(2)
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toEqual([])
  })

  it('persists to DISK so a separate process (fresh memo) still hits', () => {
    // This is the tier that matters: vitest isolates modules per test file, so
    // the in-process memo is not shared between files. Simulate a new process
    // by clearing the memo but keeping the directory.
    let calls = 0
    const run = (): { ok: boolean } => {
      calls++
      return { ok: true }
    }
    withVerdictCache('kotlin', 'v', 's', 'src', run)
    _resetValidateCache()
    process.env.PYREON_VALIDATE_CACHE_DIR = dir
    expect(withVerdictCache('kotlin', 'v', 's', 'src', run).ok).toBe(true)
    expect(calls).toBe(1)
  })

  it('treats a CORRUPT disk entry as a miss, never as a verdict', () => {
    let calls = 0
    const run = (): { ok: boolean } => {
      calls++
      return { ok: true }
    }
    const key = cacheKey('kotlin', 'v', 's', 'src')
    writeFileSync(join(dir, `${key}.json`), '{ this is not json', 'utf8')
    expect(withVerdictCache('kotlin', 'v', 's', 'src', run).ok).toBe(true)
    expect(calls).toBe(1)
  })

  it('treats a WRONG-SHAPE disk entry as a miss', () => {
    // Valid JSON, no boolean `ok` — must not be trusted as a verdict.
    let calls = 0
    const run = (): { ok: boolean } => {
      calls++
      return { ok: true }
    }
    const key = cacheKey('kotlin', 'v', 's', 'src')
    writeFileSync(join(dir, `${key}.json`), '{"ok":"yes"}', 'utf8')
    withVerdictCache('kotlin', 'v', 's', 'src', run)
    expect(calls).toBe(1)
  })

  it('bypasses entirely under PYREON_VALIDATE_NO_CACHE=1', () => {
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    let calls = 0
    const run = (): { ok: boolean } => {
      calls++
      return { ok: true }
    }
    withVerdictCache('kotlin', 'v', 's', 'src', run)
    withVerdictCache('kotlin', 'v', 's', 'src', run)
    expect(calls).toBe(2)
  })
})

describe('on-disk entries are written safely', () => {
  // CodeQL flagged the first cut here (insecure-temporary-file): the temp name
  // was `<key>.<pid>.tmp`, and the FALLBACK cache dir lives in the
  // world-writable OS temp dir. A guessable temp path can be pre-planted as a
  // symlink so the write lands elsewhere — and for a GATE cache the payoff is a
  // forged `ok` verdict, so this is worth pinning rather than suppressing.

  it('writes entries owner-only (0600)', () => {
    withVerdictCache('kotlin', 'v', 's', 'src', () => ({ ok: true }))
    const entry = readdirSync(dir).find((f) => f.endsWith('.json'))
    expect(entry, 'expected an entry to have been written').toBeDefined()
    const mode = statSync(join(dir, entry as string)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('leaves no .tmp file behind after a successful write', () => {
    withVerdictCache('kotlin', 'v', 's', 'src', () => ({ ok: true }))
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('does not embed the pid in the temp name', () => {
    // Guards the specific regression CodeQL caught: a pid is predictable.
    // Asserted against the SOURCE because a successful write removes the temp
    // file, so there is no runtime artifact left to inspect.
    const src = readFileSync(
      join(import.meta.dirname, '..', 'validate-cache.ts'),
      'utf8',
    )
    const tmpLine = src.split('\n').find((l) => l.includes('.tmp`'))
    expect(tmpLine, 'temp-path construction not found').toBeDefined()
    expect(tmpLine).toContain('randomBytes')
    expect(tmpLine).not.toContain('process.pid')
  })

  it('uses an exclusive-create flag so a planted path is not followed', () => {
    const src = readFileSync(
      join(import.meta.dirname, '..', 'validate-cache.ts'),
      'utf8',
    )
    // 'wx' fails when the path exists (symlink included) rather than writing
    // through it. This is the actual defense; the random name only makes a
    // collision unlikely.
    //
    // Assert on the writeFileSync CALL, not on the file as a whole: the first
    // version of this test matched `flag: 'wx'` anywhere in the source, and the
    // JSDoc above writeEntryAtomic names the flag in prose — so it stayed green
    // when the flag was removed from the actual call. Bisecting is what exposed
    // that; a test that a comment can satisfy asserts nothing.
    const call = src.split('\n').find((l) => l.includes('writeFileSync(tmp,'))
    expect(call, 'temp writeFileSync call not found').toBeDefined()
    expect(call).toContain("flag: 'wx'")
  })
})

describe('tool-availability probe cache', () => {
  it('round-trips an availability verdict for a real binary', () => {
    // Keyed on the resolved binary's identity, so this needs a binary that
    // actually exists on PATH; `sh` is present everywhere this suite runs.
    writeToolProbe('sh', { available: true, version: 'test-1.0' })
    expect(readToolProbe('sh')).toEqual({ available: true, version: 'test-1.0' })
  })

  it('keeps VARIANTS of the same binary separate', () => {
    // `swiftc` answers three different questions (exists / has SwiftUI / has
    // Observation). Without the variant they would overwrite each other.
    writeToolProbe('sh', { available: true, version: 'plain' })
    writeToolProbe('sh', { available: false, version: '' }, 'swiftui')
    expect(readToolProbe('sh')?.version).toBe('plain')
    expect(readToolProbe('sh', 'swiftui')?.available).toBe(false)
  })

  it('returns null for a binary that is NOT on PATH', () => {
    // "Absent" must never be cached against a stable key, or installing the
    // toolchain would not take effect until someone cleared the cache.
    expect(readToolProbe('definitely-not-a-real-binary-xyzzy')).toBeNull()
  })

  it('returns null under PYREON_VALIDATE_NO_CACHE=1', () => {
    writeToolProbe('sh', { available: true, version: 'x' })
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    expect(readToolProbe('sh')).toBeNull()
  })
})
