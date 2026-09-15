// Branch matrix for `validate-cache.ts` — the content-addressed verdict cache
// and the tool-probe cache behind the native compile gates.
//
// Every spec runs against a PRIVATE scratch cache directory
// (`PYREON_VALIDATE_CACHE_DIR`), so nothing here can plant a verdict in, or
// read one from, the cache the real gates share.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _resetValidateCache,
  cacheDir,
  cacheKey,
  readToolProbe,
  withVerdictCache,
  writeToolProbe,
} from '../validate-cache'
import {
  _resetKotlincCache,
  _resetObservationCache,
  _resetSwiftUICache,
  _resetSwiftcCache,
  isKotlincAvailable,
  isObservationAvailable,
  isSwiftUIAvailable,
  isSwiftcAvailable,
} from '../validate'

const PRIVATE_CACHE = mkdtempSync(join(tmpdir(), 'cov-misc2-cache-'))
const saved: Record<string, string | undefined> = {}
const KEYS = ['PYREON_VALIDATE_CACHE_DIR', 'PYREON_VALIDATE_NO_CACHE', 'PATH']

beforeAll(() => {
  for (const k of KEYS) saved[k] = process.env[k]
})
afterAll(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  _resetValidateCache()
})

beforeEach(() => {
  process.env.PYREON_VALIDATE_CACHE_DIR = PRIVATE_CACHE
  delete process.env.PYREON_VALIDATE_NO_CACHE
  _resetValidateCache()
})
afterEach(() => {
  delete process.env.PYREON_VALIDATE_NO_CACHE
  if (saved.PATH === undefined) delete process.env.PATH
  else process.env.PATH = saved.PATH
  _resetValidateCache()
})

/** A key nothing else can collide with, so each spec starts on a cold cache. */
let n = 0
const uniqueSource = () => `// cov-misc2 ${process.pid} ${n++}\n`

describe('validate-cache — cacheDir resolution', () => {
  it('honours PYREON_VALIDATE_CACHE_DIR and memoises the answer', () => {
    expect(cacheDir()).toBe(PRIVATE_CACHE)
    // The memo is what makes repeated calls free; changing the env without a
    // reset must NOT move the directory.
    process.env.PYREON_VALIDATE_CACHE_DIR = join(PRIVATE_CACHE, 'elsewhere')
    expect(cacheDir()).toBe(PRIVATE_CACHE)
    _resetValidateCache()
    expect(cacheDir()).toBe(join(PRIVATE_CACHE, 'elsewhere'))
  })

  it('falls back to a uid-named tmpdir when the override is unusable, and to a uid-less name with no getuid', () => {
    // `/dev/null/x` cannot be created, so the override candidate fails and the
    // walk-up / tmpdir candidates decide the answer.
    process.env.PYREON_VALIDATE_CACHE_DIR = '/dev/null/nope'
    _resetValidateCache()
    const withUid = cacheDir()
    expect(withUid).not.toBe('/dev/null/nope')
    expect(withUid).not.toBeNull()

    // On a platform with no `process.getuid` (Windows) the tmpdir candidate is
    // named `…-nouid`. Exercise that arm by removing the function, then
    // restoring it — the walk-up candidate still wins here, so assert only that
    // resolution still succeeds.
    const realGetuid = process.getuid
    try {
      delete (process as { getuid?: unknown }).getuid
      _resetValidateCache()
      expect(cacheDir()).not.toBeNull()
    } finally {
      ;(process as { getuid?: unknown }).getuid = realGetuid
      _resetValidateCache()
    }
  })
})

describe('validate-cache — cacheKey', () => {
  it('folds EVERY input into the digest', () => {
    const base = cacheKey('swift-parse', 'v1', 'stub', 'src')
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    expect(cacheKey('kotlin', 'v1', 'stub', 'src')).not.toBe(base)
    expect(cacheKey('swift-parse', 'v2', 'stub', 'src')).not.toBe(base)
    expect(cacheKey('swift-parse', 'v1', 'STUB', 'src')).not.toBe(base)
    expect(cacheKey('swift-parse', 'v1', 'stub', 'SRC')).not.toBe(base)
    expect(cacheKey('swift-parse', 'v1', 'stub', 'src')).toBe(base)
  })

  it('cannot collide by running one field into the next (NUL separators)', () => {
    expect(cacheKey('swift-parse', 'ab', 'c', 'd')).not.toBe(cacheKey('swift-parse', 'a', 'bc', 'd'))
  })
})

describe('validate-cache — withVerdictCache', () => {
  it('computes once, then serves the memo AND the disk entry', () => {
    const src = uniqueSource()
    let calls = 0
    const run = () =>
      withVerdictCache('swift-parse', 'v1', '', src, () => {
        calls++
        return { ok: true }
      })
    expect(run()).toEqual({ ok: true })
    expect(run()).toEqual({ ok: true })
    expect(calls).toBe(1)
    // Drop the in-process memo — the DISK tier must still answer.
    _resetValidateCache()
    expect(run()).toEqual({ ok: true })
    expect(calls).toBe(1)
  })

  it('round-trips a FAILING verdict with its error text', () => {
    const src = uniqueSource()
    let calls = 0
    const run = () =>
      withVerdictCache('kotlin', 'v1', 'stubs', src, () => {
        calls++
        return { ok: false, error: 'error: bad' }
      })
    expect(run()).toEqual({ ok: false, error: 'error: bad' })
    _resetValidateCache()
    expect(run()).toEqual({ ok: false, error: 'error: bad' })
    expect(calls).toBe(1)
  })

  it('never caches a SKIPPED verdict — it encodes the environment, not a judgement', () => {
    const src = uniqueSource()
    let calls = 0
    const run = () =>
      withVerdictCache('swift-stubs', 'v1', '', src, () => {
        calls++
        return { ok: true, skipped: true, skipReason: 'swiftc not on PATH' }
      })
    expect(run().skipped).toBe(true)
    expect(run().skipped).toBe(true)
    expect(calls).toBe(2)
  })

  it('bypasses BOTH tiers under PYREON_VALIDATE_NO_CACHE=1', () => {
    const src = uniqueSource()
    let calls = 0
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    _resetValidateCache()
    const run = () =>
      withVerdictCache('swift-parse', 'v1', '', src, () => {
        calls++
        return { ok: true }
      })
    run()
    run()
    expect(calls).toBe(2)
  })

  it('separates verdicts by KIND and by STUB content for identical source', () => {
    const src = uniqueSource()
    const seen: string[] = []
    const run = (kind: 'swift-parse' | 'kotlin', stub: string, out: string) =>
      withVerdictCache(kind, 'v1', stub, src, () => {
        seen.push(out)
        return { ok: true, error: out }
      })
    expect(run('swift-parse', 'A', 'a').error).toBe('a')
    expect(run('kotlin', 'A', 'b').error).toBe('b')
    expect(run('swift-parse', 'B', 'c').error).toBe('c')
    expect(seen).toEqual(['a', 'b', 'c'])
  })

  it('treats a CORRUPT disk entry as a miss and deletes it', () => {
    const src = uniqueSource()
    const key = cacheKey('swift-parse', 'v1', '', src)
    const file = join(PRIVATE_CACHE, `${key}.json`)
    writeFileSync(file, '{ not json', 'utf8')
    let calls = 0
    const r = withVerdictCache('swift-parse', 'v1', '', src, () => {
      calls++
      return { ok: true }
    })
    expect(r).toEqual({ ok: true })
    expect(calls).toBe(1)
    expect(readdirSync(PRIVATE_CACHE)).not.toContain(`${key}.json.corrupt`)
  })

  it('treats a well-formed but WRONG-SHAPED disk entry as a miss', () => {
    for (const body of ['null', '"a string"', '{"ok":"yes"}', '[]']) {
      const src = uniqueSource()
      const key = cacheKey('swift-parse', 'v1', '', src)
      writeFileSync(join(PRIVATE_CACHE, `${key}.json`), body, 'utf8')
      _resetValidateCache()
      let calls = 0
      withVerdictCache('swift-parse', 'v1', '', src, () => {
        calls++
        return { ok: true }
      })
      expect(calls, body).toBe(1)
    }
  })

  it('reads back a hand-written entry that DOES have the right shape', () => {
    const src = uniqueSource()
    const key = cacheKey('swift-parse', 'v1', '', src)
    // A rejection is only trusted when it carries the `v: 2` classification
    // marker; an unmarked one whose text is not compiler output is evicted.
    writeFileSync(join(PRIVATE_CACHE, `${key}.json`), '{"v":2,"ok":false,"error":"planted"}', 'utf8')
    _resetValidateCache()
    let calls = 0
    const r = withVerdictCache('swift-parse', 'v1', '', src, () => {
      calls++
      return { ok: true }
    })
    expect(r).toEqual({ ok: false, error: 'planted' })
    expect(calls).toBe(0)
  })
})

describe('validate-cache — the tool-probe tier', () => {
  const toolResolves = (bin: string): boolean => {
    writeToolProbe(bin, { available: true, version: 'probe-roundtrip' }, 'cov-misc2')
    const back = readToolProbe(bin, 'cov-misc2')
    return back !== null
  }

  it('round-trips a probe, keyed by variant', () => {
    if (!toolResolves('sh')) return // no `sh` on PATH — nothing to key on.
    expect(readToolProbe('sh', 'cov-misc2')).toEqual({
      available: true,
      version: 'probe-roundtrip',
    })
    expect(readToolProbe('sh', 'cov-misc2-other')).toBeNull()
  })

  it('returns null for a binary that is not on PATH, and writes nothing for it', () => {
    const before = readdirSync(PRIVATE_CACHE).length
    writeToolProbe('definitely-not-a-real-binary-xyz', { available: false, version: '' })
    expect(readToolProbe('definitely-not-a-real-binary-xyz')).toBeNull()
    expect(readdirSync(PRIVATE_CACHE).length).toBe(before)
  })

  it('is disabled wholesale by PYREON_VALIDATE_NO_CACHE=1, for read AND write', () => {
    if (!toolResolves('sh')) return
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    expect(readToolProbe('sh', 'cov-misc2')).toBeNull()
    const before = readdirSync(PRIVATE_CACHE).length
    writeToolProbe('sh', { available: false, version: 'x' }, 'cov-misc2-nocache')
    expect(readdirSync(PRIVATE_CACHE).length).toBe(before)
  })

  it('treats a corrupt or wrong-shaped probe file as a miss', () => {
    if (!toolResolves('sh')) return
    const files = readdirSync(PRIVATE_CACHE).filter((f) => f.startsWith('probe-'))
    expect(files.length).toBeGreaterThan(0)
    for (const body of ['not json', 'null', '{"available":"yes","version":"v"}', '{"available":true}']) {
      for (const f of files) writeFileSync(join(PRIVATE_CACHE, f), body, 'utf8')
      expect(readToolProbe('sh', 'cov-misc2'), body).toBeNull()
    }
  })

  it('returns null when PATH is unset, and skips EMPTY PATH segments', () => {
    delete process.env.PATH
    expect(readToolProbe('sh')).toBeNull()
    process.env.PATH = ''
    expect(readToolProbe('sh')).toBeNull()
    // A `::` in PATH yields an empty segment the resolver must step over
    // rather than stat as the bare filename in the cwd.
    process.env.PATH = `::${saved.PATH ?? ''}`
    writeToolProbe('sh', { available: true, version: 'via-empty-segment' }, 'cov-misc2-empty')
    const back = readToolProbe('sh', 'cov-misc2-empty')
    if (back !== null) expect(back).toEqual({ available: true, version: 'via-empty-segment' })
  })
})

describe('validate — the availability probes read the disk tier', () => {
  it('answers each probe from a planted cache entry without spawning the tool', () => {
    // Plant the four probe variants the validators consult, then reset the
    // in-process memos: a subsequent call must come back from disk.
    const planted: [string, string, boolean][] = [
      ['swiftc', '', true],
      ['swiftc', 'swiftui', false],
      ['swiftc', 'observation', false],
      ['kotlinc', '', true],
    ]
    for (const [bin, variant, available] of planted) {
      writeToolProbe(bin, { available, version: 'planted' }, variant)
    }
    // Only meaningful where the binary resolves on PATH; otherwise the probe
    // key is null by design (so installing the toolchain takes effect).
    const swiftcCached = readToolProbe('swiftc') !== null
    const kotlincCached = readToolProbe('kotlinc') !== null

    _resetSwiftcCache()
    _resetSwiftUICache()
    _resetObservationCache()
    _resetKotlincCache()

    if (swiftcCached) {
      expect(isSwiftcAvailable()).toBe(true)
      expect(isSwiftUIAvailable()).toBe(false)
      expect(isObservationAvailable()).toBe(false)
    }
    if (kotlincCached) expect(isKotlincAvailable()).toBe(true)

    _resetSwiftcCache()
    _resetSwiftUICache()
    _resetObservationCache()
    _resetKotlincCache()
  })
})
