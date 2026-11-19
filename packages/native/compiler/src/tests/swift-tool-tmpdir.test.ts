// The Swift driver creates a `TemporaryDirectory.XXXXXX` under `$TMPDIR` on
// every invocation (even `swiftc --version`) and never removes it. Before
// `swift-tool.ts`, each `validateSwift` call left one in the shared temp dir,
// outside the `mkdtemp` directory the call site deletes. These specs run the
// real toolchain with `TMPDIR` pointed at a private parent and count what is
// left there.

import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execSwiftToolSync } from '../swift-tool'
import { _resetSwiftcCache, isSwiftcAvailable, validateSwift } from '../validate'

const skip =
  process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
  (!isSwiftcAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

const ENV_KEYS = ['TMPDIR', 'PYREON_VALIDATE_NO_CACHE'] as const
let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}
let parent = ''

const leftovers = (): string[] => readdirSync(parent).sort()

describe.skipIf(skip)('Swift tool spawns leave nothing in $TMPDIR', () => {
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
    parent = mkdtempSync(join(tmpdir(), 'pyreon-swift-tool-test-'))
    process.env.TMPDIR = parent
    // A cached verdict or tool probe would skip the spawn this counts.
    process.env.PYREON_VALIDATE_NO_CACHE = '1'
    _resetSwiftcCache()
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = saved[k]
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    _resetSwiftcCache()
    rmSync(parent, { recursive: true, force: true })
  })

  it('validateSwift (probe + swiftc -parse) leaves no TemporaryDirectory.* and no scratch dir', () => {
    expect(leftovers()).toEqual([])
    expect(validateSwift('let answer = 42\n')).toEqual({ ok: true })
    expect(leftovers()).toEqual([])
  })

  it('a failing compile cleans up too', () => {
    expect(validateSwift('let = \n').ok).toBe(false)
    expect(leftovers()).toEqual([])
  })

  it('execSwiftToolSync points the driver at a private TMPDIR it then removes', () => {
    const out = execSwiftToolSync('swiftc', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    expect(out).toMatch(/swift/i)
    expect(leftovers()).toEqual([])
  })
})
