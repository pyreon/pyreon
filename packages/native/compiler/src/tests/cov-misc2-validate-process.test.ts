// Branch matrix for `validate.ts`'s PROCESS boundary — tool probing, the
// absent-tool policy, and the failure-diagnostic assembly.
//
// `execFileSync` is the seam: these specs drive the real validators with a
// routed fake compiler so each documented failure SHAPE (spawn failure, a
// non-zero status with Buffer output, with string output, with neither, and
// kotlinc's own "exits 0 but throws" quirk) is exercised against the REAL
// coercion code rather than a re-implementation of it.
//
// The verdict cache is disabled AND pointed at a private scratch directory for
// the whole file, so no fabricated verdict can ever reach the shared cache.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface FakeError {
  stdout?: string | Buffer
  stderr?: string | Buffer
  message?: string
  status?: number
}
type Behaviour = { out?: string; err?: FakeError }

/** Routed per (binary, args) so the version probes can succeed while a compile fails. */
let route: (file: string, args: readonly string[]) => Behaviour = () => ({})

const execFileSyncMock = vi.fn((file: string, args: readonly string[] = []) => {
  const b = route(file, args)
  if (b.err) throw b.err
  return b.out ?? ''
})

vi.mock('node:child_process', () => ({
  execFileSync: (file: string, args: readonly string[]) => execFileSyncMock(file, args),
}))

const {
  _resetKotlincCache,
  _resetObservationCache,
  _resetSwiftUICache,
  _resetSwiftcCache,
  isKotlincAvailable,
  isObservationAvailable,
  isSwiftUIAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwift,
  validateSwiftTypecheck,
  validateSwiftWithStubs,
} = await import('../validate')

const PRIVATE_CACHE = mkdtempSync(join(tmpdir(), 'cov-misc2-validate-'))
const saved: Record<string, string | undefined> = {}
const ENV_KEYS = [
  'PYREON_VALIDATE_NO_CACHE',
  'PYREON_VALIDATE_CACHE_DIR',
  'PYREON_SKIP_NATIVE_VALIDATE',
  'PYREON_REQUIRE_NATIVE_VALIDATE',
]

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  // Never touch the shared verdict cache from a file that fakes the compiler.
  process.env.PYREON_VALIDATE_NO_CACHE = '1'
  process.env.PYREON_VALIDATE_CACHE_DIR = PRIVATE_CACHE
  delete process.env.PYREON_SKIP_NATIVE_VALIDATE
  delete process.env.PYREON_REQUIRE_NATIVE_VALIDATE
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function resetProbes(): void {
  _resetSwiftcCache()
  _resetSwiftUICache()
  _resetObservationCache()
  _resetKotlincCache()
}

beforeEach(() => {
  resetProbes()
  execFileSyncMock.mockClear()
  route = () => ({})
})
afterEach(() => {
  delete process.env.PYREON_SKIP_NATIVE_VALIDATE
  delete process.env.PYREON_REQUIRE_NATIVE_VALIDATE
  resetProbes()
})

/** The availability probes compile a file inside a `pyreon-<kind>-probe-` temp
 *  dir; the real validators compile `input.swift` / `Input.kt` elsewhere. Routing
 *  on the PATH is what keeps a probe distinguishable from the compile under test
 *  (both are a two-argument `swiftc -typecheck`). */
const isProbe = (a: readonly string[], kind: 'swiftui' | 'observation'): boolean =>
  a.some((x) => x.includes(`pyreon-${kind}-probe-`))
const isProbeCompile = (a: readonly string[]): boolean =>
  isProbe(a, 'swiftui') || isProbe(a, 'observation')

/** An ENOENT-shaped spawn failure — what `execFileSync` throws for a missing binary. */
const spawnFailure = (bin: string): FakeError => ({
  // A spawn failure carries a message and NO `status` — that absence is what
  // tells `isKotlincAvailable` it is not the "exits 0 but throws" case.
  message: `spawnSync ${bin} ENOENT`,
})

describe('validate — tool probing', () => {
  it('reports swiftc available and captures its version from stdout', () => {
    route = (f, a) =>
      f === 'swiftc' && a[0] === '--version' ? { out: 'swift-driver version: 1.90\n' } : {}
    expect(isSwiftcAvailable()).toBe(true)
  })

  it('reports swiftc ABSENT when the probe spawn fails', () => {
    route = () => ({ err: spawnFailure('swiftc') })
    expect(isSwiftcAvailable()).toBe(false)
  })

  it('short-circuits the SwiftUI and Observation probes when swiftc itself is absent', () => {
    route = () => ({ err: spawnFailure('swiftc') })
    expect(isSwiftUIAvailable()).toBe(false)
    expect(isObservationAvailable()).toBe(false)
  })

  it('takes the kotlinc status-0 version from a STRING stderr as well as a Buffer', () => {
    route = (f) => (f === 'kotlinc' ? { err: { status: 0, stderr: 'info: kotlinc-jvm 2.0.0' } } : {})
    expect(isKotlincAvailable()).toBe(true)
    _resetKotlincCache()
    route = (f) => (f === 'kotlinc' ? { err: { status: 0 } } : {})
    expect(isKotlincAvailable()).toBe(true)
  })

  it('treats a kotlinc probe that THROWS with status 0 as available, taking the version from stderr', () => {
    // `kotlinc -version` writes its banner to stderr; some wrappers still make
    // execFileSync throw while reporting a zero exit status.
    route = (f) =>
      f === 'kotlinc'
        ? { err: { status: 0, stderr: Buffer.from('info: kotlinc-jvm 2.0.0\n') } }
        : {}
    expect(isKotlincAvailable()).toBe(true)
  })

  it('treats a kotlinc probe throwing with a NON-zero status as absent', () => {
    route = (f) => (f === 'kotlinc' ? { err: { status: 1, stderr: 'boom' } } : {})
    expect(isKotlincAvailable()).toBe(false)
  })

  it('probes swiftc only once per process (the memo), for the version too', () => {
    route = (f, a) => (f === 'swiftc' && a[0] === '--version' ? { out: 'v' } : {})
    expect(isSwiftcAvailable()).toBe(true)
    expect(isSwiftcAvailable()).toBe(true)
    expect(execFileSyncMock.mock.calls.filter((c) => c[1]?.[0] === '--version')).toHaveLength(1)
  })
})

describe('validate — the absent-tool policy', () => {
  const swiftSrc = 'let x = 1\n'
  const kotlinSrc = 'fun main() {}\n'

  it('SKIPS every validator when the tool is absent', () => {
    route = () => ({ err: spawnFailure('missing') })
    for (const r of [
      validateSwift(swiftSrc),
      validateSwiftTypecheck(swiftSrc),
      validateSwiftWithStubs(swiftSrc),
    ]) {
      expect(r).toEqual({ ok: true, skipped: true, skipReason: 'swiftc not on PATH' })
    }
    expect(validateKotlin(kotlinSrc)).toEqual({
      ok: true,
      skipped: true,
      skipReason: 'kotlinc not on PATH',
    })
  })

  it('FAILS instead of skipping under PYREON_REQUIRE_NATIVE_VALIDATE=1', () => {
    route = () => ({ err: spawnFailure('missing') })
    process.env.PYREON_REQUIRE_NATIVE_VALIDATE = '1'
    for (const r of [
      validateSwift(swiftSrc),
      validateSwiftTypecheck(swiftSrc),
      validateSwiftWithStubs(swiftSrc),
    ]) {
      expect(r.ok).toBe(false)
      expect(r.error).toContain('swiftc not found on PATH')
      expect(r.skipped).toBeUndefined()
    }
    const k = validateKotlin(kotlinSrc)
    expect(k.ok).toBe(false)
    expect(k.error).toContain('kotlinc not found on PATH')
  })

  it('SKIPS before probing anything at all under PYREON_SKIP_NATIVE_VALIDATE=1', () => {
    process.env.PYREON_SKIP_NATIVE_VALIDATE = '1'
    // Even with REQUIRE also set, SKIP is checked first.
    process.env.PYREON_REQUIRE_NATIVE_VALIDATE = '1'
    route = () => {
      throw new Error('no process should be spawned')
    }
    for (const r of [
      validateSwift(swiftSrc),
      validateSwiftTypecheck(swiftSrc),
      validateSwiftWithStubs(swiftSrc),
      validateKotlin(kotlinSrc),
    ]) {
      expect(r).toEqual({
        ok: true,
        skipped: true,
        skipReason: 'PYREON_SKIP_NATIVE_VALIDATE=1',
      })
    }
  })

  it('SKIPS the typecheck gate when swiftc exists but the SwiftUI SDK does not', () => {
    route = (f, a) => {
      if (a[0] === '--version') return { out: 'swiftc 6' }
      // Fail the SwiftUI probe, and only it.
      if (isProbe(a, 'swiftui')) return { err: { status: 1, stderr: 'no such module SwiftUI' } }
      return {}
    }
    expect(validateSwiftTypecheck('let x = 1\n')).toEqual({
      ok: true,
      skipped: true,
      skipReason: 'SwiftUI SDK not available (non-macOS)',
    })
  })

  it('SKIPS an @Observable stub compile when the Observation module is unavailable', () => {
    route = (f, a) => {
      if (a[0] === '--version') return { out: 'swiftc 6' }
      if (isProbe(a, 'observation')) {
        return { err: { status: 1, stderr: 'no such module Observation' } }
      }
      return {}
    }
    expect(validateSwiftWithStubs('@Observable final class S { var x = 0 }\n')).toEqual({
      ok: true,
      skipped: true,
      skipReason: 'Observation module unavailable on this toolchain',
    })
  })
})

describe('validate — failure-diagnostic assembly', () => {
  /** Make the named binary available, and fail the COMPILE with `err`. */
  function failCompile(bin: 'swiftc' | 'kotlinc', err: FakeError): void {
    route = (f, a) => {
      if (a[0] === '--version' || a[0] === '-version') return { out: `${f} 1.0` }
      if (isProbeCompile(a)) return {} // the SwiftUI / Observation probes pass
      return f === bin ? { err } : {}
    }
  }

  const SWIFT_VALIDATORS: [string, (s: string) => { ok: boolean; error?: string }][] = [
    ['validateSwift', validateSwift],
    ['validateSwiftTypecheck', validateSwiftTypecheck],
    ['validateSwiftWithStubs', validateSwiftWithStubs],
  ]

  it('joins BUFFER stderr and stdout, stderr first', () => {
    for (const [name, run] of SWIFT_VALIDATORS) {
      failCompile('swiftc', {
        stderr: Buffer.from('error: bad\n'),
        stdout: Buffer.from('note: here\n'),
      })
      const r = run('let x = 1\n')
      expect(r.ok, name).toBe(false)
      expect(r.error, name).toBe('error: bad\n\nnote: here')
    }
    failCompile('kotlinc', {
      stderr: Buffer.from('error: k\n'),
      stdout: Buffer.from('note: k\n'),
    })
    expect(validateKotlin('fun main() {}\n').error).toBe('error: k\n\nnote: k')
  })

  it('takes STRING stderr / stdout through the non-Buffer arm unchanged', () => {
    for (const [name, run] of SWIFT_VALIDATORS) {
      failCompile('swiftc', { stderr: 'string-err', stdout: 'string-out' })
      expect(run('let x = 1\n').error, name).toBe('string-err\nstring-out')
    }
    failCompile('kotlinc', { stderr: 'k-err', stdout: 'k-out' })
    expect(validateKotlin('fun main() {}\n').error).toBe('k-err\nk-out')
  })

  it('falls back to the thrown message when there is no captured output at all', () => {
    for (const [name, run] of SWIFT_VALIDATORS) {
      failCompile('swiftc', { message: 'Command failed: swiftc' })
      expect(run('let x = 1\n').error, name).toBe('Command failed: swiftc')
    }
    failCompile('kotlinc', { message: 'Command failed: kotlinc' })
    expect(validateKotlin('fun main() {}\n').error).toBe('Command failed: kotlinc')
  })

  it('falls back to a per-validator literal when there is no output AND no message', () => {
    const expected = [
      'swiftc -parse failed with no output',
      'swiftc -typecheck failed with no output',
      'swiftc -typecheck (stubs) failed with no output',
    ]
    SWIFT_VALIDATORS.forEach(([name, run], i) => {
      failCompile('swiftc', {})
      expect(run('let x = 1\n').error, name).toBe(expected[i])
    })
    failCompile('kotlinc', {})
    expect(validateKotlin('fun main() {}\n').error).toBe('kotlinc failed with no output')
  })

  it('reports ok with no error when the compiler exits cleanly', () => {
    route = (f, a) => (a[0] === '--version' || a[0] === '-version' ? { out: `${f} 1.0` } : {})
    for (const [name, run] of SWIFT_VALIDATORS) {
      expect(run('let x = 1\n'), name).toEqual({ ok: true })
    }
    expect(validateKotlin('fun main() {}\n')).toEqual({ ok: true })
  })
})
